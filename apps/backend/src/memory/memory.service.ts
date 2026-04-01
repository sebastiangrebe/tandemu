import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MemoryMetadata } from '@tandemu/types';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly mem0ApiKey: string;
  private readonly openmemoryHost: string;
  private readonly openmemoryPort: number;

  constructor(private readonly configService: ConfigService) {
    this.mem0ApiKey = this.configService.get<string>('memory.mem0ApiKey', '');
    this.openmemoryHost = this.configService.get<string>('memory.openmemoryHost', 'localhost');
    this.openmemoryPort = this.configService.get<number>('memory.openmemoryPort', 8765);

    this.logger.log(`Memory provider: ${this.isMem0Cloud ? 'Mem0 Cloud' : 'OpenMemory'} (key ${this.mem0ApiKey ? 'present' : 'MISSING'})`);
  }

  get isMem0Cloud(): boolean {
    return !!this.mem0ApiKey;
  }

  getUpstreamSseUrl(userId: string): string {
    if (this.isMem0Cloud) {
      return `https://mcp.mem0.ai/mcp`;
    }
    return `http://${this.openmemoryHost}:${this.openmemoryPort}/mcp/tandemu/sse/${userId}`;
  }

  getUpstreamHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'text/event-stream',
    };
    if (this.isMem0Cloud) {
      headers['Authorization'] = `Token ${this.mem0ApiKey}`;
    }
    return headers;
  }

  getUpstreamMessageHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.isMem0Cloud) {
      headers['Authorization'] = `Token ${this.mem0ApiKey}`;
    }
    return headers;
  }

  /**
   * Call an MCP tool on the upstream memory server.
   * For org-scoped operations, the userId in the URL (OSS) doesn't affect scoping —
   * org memories are scoped by app_id in the arguments. We use a fixed 'system' userId
   * so we don't need a real user context for server-initiated operations.
   *
   * Works with both Mem0 Cloud (SaaS) and OpenMemory (OSS):
   * - Mem0 Cloud: POST to https://mcp.mem0.ai/mcp with Token auth — returns SSE (data: lines)
   * - OpenMemory: POST to http://host:port/mcp/tandemu/sse/{userId} — returns SSE or JSON
   * Response is read as text and format is auto-detected.
   */
  private async callMcpTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const systemUserId = 'system';
    const url = this.getUpstreamSseUrl(systemUserId);
    const headers = this.getUpstreamHeaders();

    const response: globalThis.Response = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream, application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `selfheal-${Date.now()}`,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`MCP tool ${toolName} failed (${response.status}): ${errText}`);
    }

    // Read response as text first, then auto-detect format.
    // Both providers may return SSE (data: lines) or JSON depending on the endpoint.
    const responseText = await response.text();

    // Check if response is SSE format (starts with "data:" or "event:")
    if (responseText.trimStart().startsWith('data:') || responseText.trimStart().startsWith('event:')) {
      const dataLines = responseText.split('\n').filter((l) => l.startsWith('data: '));
      for (const line of dataLines) {
        const payload = line.slice(6).trim();
        if (payload && payload !== '[DONE]') {
          try {
            return JSON.parse(payload);
          } catch {
            // Not valid JSON, continue
          }
        }
      }
      return {};
    }

    // Plain JSON response
    try {
      return JSON.parse(responseText);
    } catch {
      return {};
    }
  }

  /**
   * Create an org-scoped memory (published, visible to all org members).
   */
  async createOrgMemory(
    organizationId: string,
    content: string,
    metadata: MemoryMetadata,
  ): Promise<void> {
    try {
      await this.callMcpTool('add_memory', {
        content,
        user_id: organizationId,
        metadata: { ...metadata, status: 'published' },
      });
    } catch (err) {
      this.logger.warn(`Failed to create org memory: ${err}`);
    }
  }

  // ---- Direct REST API (bypasses MCP for dashboard reads) ----

  /**
   * Fetch all memories for a given user_id via the Mem0 REST API.
   * Much faster than MCP for dashboard read-only operations.
   */
  async getMemoriesRest(userId: string): Promise<Array<Record<string, unknown>>> {
    if (!this.isMem0Cloud) {
      // OSS OpenMemory doesn't have a REST API — fall back to MCP via callMcpTool
      return [];
    }

    const response = await fetch('https://api.mem0.ai/v2/memories/', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.mem0ApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filters: { user_id: userId },
        page_size: 200,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.warn(`Mem0 REST get_memories failed (${response.status}): ${text}`);
      return [];
    }

    const data = await response.json() as { results?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
    if (Array.isArray(data)) return data;
    return data.results ?? [];
  }

  /**
   * Search org memories by query text.
   */
  async searchOrgMemories(
    organizationId: string,
    query: string,
    limit = 10,
  ): Promise<Array<{ id: string; content: string; metadata: Record<string, unknown> }>> {
    try {
      const result = await this.callMcpTool('search_memories', {
        query,
        user_id: organizationId,
        limit,
      }) as { result?: { content?: Array<{ text?: string }> } };

      // MCP returns results in content[].text as JSON
      const text = result?.result?.content?.[0]?.text;
      if (!text) return [];

      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((m: Record<string, unknown>) => ({
          id: String(m.id ?? ''),
          content: String(m.memory ?? m.content ?? ''),
          metadata: (m.metadata ?? {}) as Record<string, unknown>,
        }));
      }
      return [];
    } catch (err) {
      this.logger.warn(`Failed to search org memories: ${err}`);
      return [];
    }
  }

  /**
   * Clean up stale draft org memories older than `staleDays`.
   * - Task done → promote to published
   * - Task cancelled or draft too old → delete
   */
  async cleanStaleDrafts(
    orgId: string,
    staleDays: number,
    taskStatusLookup: (taskId: string) => Promise<string | undefined>,
  ): Promise<{ promoted: number; deleted: number }> {
    let promoted = 0;
    let deleted = 0;

    const memories = await this.getMemoriesRest(orgId);
    if (memories.length === 0) {
      // Try MCP fallback for OSS
      const mcpResult = await this.callMcpTool('get_memories', {
        user_id: orgId,
        filters: { user_id: orgId },
      });
      const parsed = this.extractMcpMemories(mcpResult);
      memories.push(...parsed);
    }

    const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

    for (const mem of memories) {
      const metadata = (mem.metadata ?? {}) as Record<string, unknown>;
      if (metadata.status !== 'draft') continue;

      // Check age — Mem0 stores created_at on the memory object
      const createdAt = mem.created_at ?? mem.createdAt ?? (metadata as any).created_at;
      if (createdAt && new Date(String(createdAt)) > cutoff) continue;

      const taskId = metadata.taskId as string | undefined;
      const memoryId = String(mem.id);

      if (taskId) {
        const taskStatus = await taskStatusLookup(taskId);
        if (taskStatus === 'done') {
          await this.promoteMemory(memoryId);
          promoted++;
          continue;
        }
        if (taskStatus === 'cancelled' || new Date(String(createdAt)) <= cutoff) {
          await this.deleteMemory(memoryId);
          deleted++;
          continue;
        }
      } else {
        // No task linked — delete if old
        await this.deleteMemory(memoryId);
        deleted++;
      }
    }

    return { promoted, deleted };
  }

  private extractMcpMemories(result: unknown): Array<Record<string, unknown>> {
    const r = result as { result?: { content?: Array<{ text?: string }> } };
    const text = r?.result?.content?.[0]?.text;
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.memories && Array.isArray(parsed.memories)) return parsed.memories;
      return [];
    } catch {
      return [];
    }
  }

  private async promoteMemory(memoryId: string): Promise<void> {
    try {
      await this.callMcpTool('update_memory', {
        memory_id: memoryId,
        metadata: { status: 'published' },
      });
    } catch (err) {
      this.logger.warn(`Failed to promote memory ${memoryId}: ${err}`);
    }
  }

  private async deleteMemory(memoryId: string): Promise<void> {
    try {
      await this.callMcpTool('delete_memory', {
        memory_id: memoryId,
      });
    } catch (err) {
      this.logger.warn(`Failed to delete memory ${memoryId}: ${err}`);
    }
  }

  /**
   * Fetch all memories for a user_id, using REST API with MCP fallback.
   */
  private async getAllMemories(userId: string): Promise<Array<Record<string, unknown>>> {
    const memories = await this.getMemoriesRest(userId);
    if (memories.length === 0) {
      const mcpResult = await this.callMcpTool('get_memories', {
        user_id: userId,
        filters: { user_id: userId },
      });
      memories.push(...this.extractMcpMemories(mcpResult));
    }
    return memories;
  }

  /**
   * Delete all personal memories for a user.
   */
  async deleteAllUserMemories(userId: string): Promise<number> {
    const memories = await this.getAllMemories(userId);
    let deleted = 0;
    for (const mem of memories) {
      await this.deleteMemory(String(mem.id));
      deleted++;
    }
    return deleted;
  }

  /**
   * Reassign org memories authored by a user to a new owner.
   */
  async reassignUserOrgMemories(
    orgId: string,
    fromUserId: string,
    toUserId: string,
  ): Promise<number> {
    const memories = await this.getAllMemories(orgId);
    let reassigned = 0;
    for (const mem of memories) {
      const metadata = (mem.metadata ?? {}) as Record<string, unknown>;
      if (metadata.author_id !== fromUserId) continue;
      try {
        await this.callMcpTool('update_memory', {
          memory_id: String(mem.id),
          metadata: { author_id: toUserId },
        });
        reassigned++;
      } catch (err) {
        this.logger.warn(`Failed to reassign memory ${mem.id}: ${err}`);
      }
    }
    return reassigned;
  }
}
