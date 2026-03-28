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
        app_id: organizationId,
        user_id: organizationId,
        metadata: { ...metadata, status: 'published' },
      });
    } catch (err) {
      this.logger.warn(`Failed to create org memory: ${err}`);
    }
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
        app_id: organizationId,
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
}
