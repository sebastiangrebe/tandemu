import { Injectable, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { MemoryMetadata } from '@tandemu/types';
import type { RequestUser } from '../auth/auth.decorator.js';
import { TasksService } from '../integrations/tasks.service.js';
import { IntegrationsService } from '../integrations/integrations.service.js';
import { githubFetch } from '../integrations/providers/github.provider.js';
import type { MemoryOpsJobData } from '../queue/queue.types.js';

/**
 * Unified memory service that works with both Mem0 Cloud (SaaS) and mem0 OSS.
 * Both use REST APIs with slightly different base URLs and path prefixes:
 * - Cloud: https://api.mem0.ai/v1/memories/  (Token auth)
 * - OSS:   http://host:port/memories/         (no auth)
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);
  private readonly mem0ApiKey: string;
  private readonly mem0OssHost: string;
  private readonly mem0OssPort: number;

  // Process-local cache. Multiple backend pods will each lazy-fill their own copy
  // — that's fine: a miss just means an extra Linear/Jira call, not incorrect gating.
  private readonly publishedTaskCache = new Map<string, boolean>();

  constructor(
    private readonly configService: ConfigService,
    @Optional() @Inject(forwardRef(() => TasksService))
    private readonly tasksService?: TasksService,
    @Optional() @Inject(forwardRef(() => IntegrationsService))
    private readonly integrationsService?: IntegrationsService,
    @Optional() @InjectQueue('memory-ops')
    private readonly memoryOpsQueue?: Queue<MemoryOpsJobData>,
  ) {
    this.mem0ApiKey = this.configService.get<string>('memory.mem0ApiKey', '');
    this.mem0OssHost = this.configService.get<string>('memory.openmemoryHost', 'localhost');
    this.mem0OssPort = this.configService.get<number>('memory.openmemoryPort', 8000);

    this.logger.log(`Memory provider: ${this.isMem0Cloud ? 'Mem0 Cloud' : 'mem0 OSS'} (key ${this.mem0ApiKey ? 'present' : 'MISSING'})`);
  }

  get isMem0Cloud(): boolean {
    return !!this.mem0ApiKey;
  }

  // ---- URL & header helpers ----

  /** Base URL for memory REST API (no trailing slash) */
  private get baseUrl(): string {
    if (this.isMem0Cloud) {
      return 'https://api.mem0.ai';
    }
    return `http://${this.mem0OssHost}:${this.mem0OssPort}`;
  }

  /** Memories endpoint path (Cloud uses /v1/, OSS has no prefix) */
  private memoriesUrl(memoryId?: string): string {
    const prefix = this.isMem0Cloud ? '/v1' : '';
    const slash = this.isMem0Cloud ? '/' : '';
    return memoryId
      ? `${this.baseUrl}${prefix}/memories/${memoryId}${slash}`
      : `${this.baseUrl}${prefix}/memories${slash}`;
  }

  /** Search endpoint path */
  private searchUrl(): string {
    if (this.isMem0Cloud) {
      return `${this.baseUrl}/v1/memories/search/`;
    }
    return `${this.baseUrl}/search`;
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.isMem0Cloud) {
      headers['Authorization'] = `Token ${this.mem0ApiKey}`;
    }
    return headers;
  }

  // ---- MCP proxy helpers (still needed for Claude Code → backend → upstream) ----

  /** SSE URL for MCP proxy (used by controller's proxySse/proxyMcp) */
  getUpstreamSseUrl(userId: string): string {
    if (this.isMem0Cloud) {
      return 'https://mcp.mem0.ai/mcp';
    }
    // mem0 OSS MCP endpoint (if available; the MCP proxy is kept for Claude Code compatibility)
    return `http://${this.mem0OssHost}:${this.mem0OssPort}/mcp/sse/${userId}`;
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

  // ---- Core REST operations (unified for Cloud + OSS) ----

  /**
   * Fetch all memories for a given user_id.
   */
  async getMemories(userId: string): Promise<Array<Record<string, unknown>>> {
    try {
      const url = `${this.memoriesUrl()}?user_id=${encodeURIComponent(userId)}`;
      const response = await fetch(url, { headers: this.authHeaders() });

      if (!response.ok) {
        if (response.status === 404) return []; // User not found — expected for new users
        const text = await response.text().catch(() => '');
        this.logger.warn(`get_memories failed (${response.status}): ${text}`);
        return [];
      }

      const data = await response.json() as Record<string, unknown>;
      return this.extractMemoryArray(data);
    } catch (err) {
      this.logger.warn(`get_memories error: ${err}`);
      Sentry.captureException(err, { tags: { operation: 'memory-get-all' } });
      return [];
    }
  }

  /**
   * Search memories by query.
   */
  async searchMemories(
    userId: string,
    query: string,
    limit = 20,
  ): Promise<Array<Record<string, unknown>>> {
    try {
      const response = await fetch(this.searchUrl(), {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify({
          query,
          user_id: userId,
          ...(this.isMem0Cloud
            ? { filters: { user_id: userId }, top_k: limit }
            : { limit }),
        }),
      });

      if (!response.ok) {
        if (response.status === 404) return [];
        const text = await response.text().catch(() => '');
        this.logger.warn(`search_memories failed (${response.status}): ${text}`);
        return [];
      }

      const data = await response.json() as Record<string, unknown>;
      return this.extractMemoryArray(data);
    } catch (err) {
      this.logger.warn(`search_memories error: ${err}`);
      Sentry.captureException(err, { tags: { operation: 'memory-search' } });
      return [];
    }
  }

  /**
   * Add a memory.
   */
  async addMemory(
    userId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const body: Record<string, unknown> = this.isMem0Cloud
        ? { messages: [{ role: 'user', content }], user_id: userId, metadata }
        : { messages: [{ role: 'user', content }], user_id: userId, metadata };

      const response = await fetch(this.memoriesUrl(), {
        method: 'POST',
        headers: this.authHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logger.warn(`add_memory failed (${response.status}): ${text}`);
      }
    } catch (err) {
      this.logger.warn(`add_memory error: ${err}`);
      Sentry.captureException(err, { tags: { operation: 'memory-add' } });
    }
  }

  /**
   * Update a memory by ID.
   */
  async updateMemory(
    memoryId: string,
    text: string,
  ): Promise<void> {
    const response = await fetch(this.memoriesUrl(memoryId), {
      method: 'PUT',
      headers: this.authHeaders(),
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`update_memory failed (${response.status}): ${errText}`);
    }
  }

  /**
   * Delete a memory by ID.
   */
  async deleteMemoryById(memoryId: string): Promise<void> {
    const response = await fetch(this.memoriesUrl(memoryId), {
      method: 'DELETE',
      headers: this.authHeaders(),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`delete_memory failed (${response.status}): ${errText}`);
    }
  }

  // ---- Higher-level operations ----

  /**
   * Create an org-scoped memory (published, visible to all org members).
   */
  async createOrgMemory(
    organizationId: string,
    content: string,
    metadata: MemoryMetadata,
  ): Promise<void> {
    await this.addMemory(organizationId, content, { ...metadata, status: 'published' });
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
      const memories = await this.searchMemories(organizationId, query, limit);
      return memories.map((m) => ({
        id: String(m.id ?? ''),
        content: String(m.memory ?? m.content ?? ''),
        metadata: (m.metadata ?? {}) as Record<string, unknown>,
      }));
    } catch (err) {
      this.logger.warn(`Failed to search org memories: ${err}`);
      Sentry.captureException(err, { tags: { operation: 'memory-search-org' } });
      return [];
    }
  }

  /**
   * Clean up stale draft org memories older than `staleDays`.
   */
  async cleanStaleDrafts(
    orgId: string,
    staleDays: number,
    taskStatusLookup: (taskId: string) => Promise<string | undefined>,
  ): Promise<{ promoted: number; deleted: number }> {
    let promoted = 0;
    let deleted = 0;

    const memories = await this.getMemories(orgId);
    const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

    for (const mem of memories) {
      const metadata = (mem.metadata ?? {}) as Record<string, unknown>;
      if (metadata.status !== 'draft') continue;

      const createdAt = mem.created_at ?? mem.createdAt ?? (metadata as Record<string, unknown>).created_at;
      if (createdAt && new Date(String(createdAt)) > cutoff) continue;

      const taskId = metadata.taskId as string | undefined;
      const memoryId = String(mem.id);

      if (taskId) {
        const taskStatus = await taskStatusLookup(taskId);
        if (taskStatus === 'done') {
          try {
            await this.updateMemory(memoryId, String(mem.memory ?? mem.content ?? ''));
            promoted++;
          } catch (err) {
            this.logger.warn(`Failed to promote memory ${memoryId}: ${err}`);
            Sentry.captureException(err, { tags: { operation: 'memory-promote' }, extra: { memoryId } });
          }
          continue;
        }
        if (taskStatus === 'cancelled' || new Date(String(createdAt)) <= cutoff) {
          try {
            await this.deleteMemoryById(memoryId);
            deleted++;
          } catch (err) {
            this.logger.warn(`Failed to delete memory ${memoryId}: ${err}`);
            Sentry.captureException(err, { tags: { operation: 'memory-delete' }, extra: { memoryId } });
          }
          continue;
        }
      } else {
        try {
          await this.deleteMemoryById(memoryId);
          deleted++;
        } catch (err) {
          this.logger.warn(`Failed to delete stale memory ${memoryId}: ${err}`);
          Sentry.captureException(err, { tags: { operation: 'memory-delete' }, extra: { memoryId } });
        }
      }
    }

    return { promoted, deleted };
  }

  /**
   * Delete all personal memories for a user.
   */
  async deleteAllUserMemories(userId: string): Promise<number> {
    const memories = await this.getMemories(userId);
    let deleted = 0;
    for (const mem of memories) {
      try {
        await this.deleteMemoryById(String(mem.id));
        deleted++;
      } catch (err) {
        this.logger.warn(`Failed to delete memory ${mem.id}: ${err}`);
        Sentry.captureException(err, { tags: { operation: 'memory-delete-user' } });
      }
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
    const memories = await this.getMemories(orgId);
    let reassigned = 0;
    for (const mem of memories) {
      const metadata = (mem.metadata ?? {}) as Record<string, unknown>;
      if (metadata.author_id !== fromUserId) continue;
      try {
        await this.updateMemory(String(mem.id), String(mem.memory ?? mem.content ?? ''));
        reassigned++;
      } catch (err) {
        this.logger.warn(`Failed to reassign memory ${mem.id}: ${err}`);
        Sentry.captureException(err, { tags: { operation: 'memory-reassign' }, extra: { memoryId: String(mem.id) } });
      }
    }
    return reassigned;
  }

  // ---- Draft gating + dual-scope search (single source of truth) ----

  /**
   * Search personal + org memories, apply draft-gating self-healing, dedupe.
   * Used by both the dashboard REST endpoint (`/api/memory/search`) and the
   * unified search service. Centralises the lazy promote/delete behaviour
   * documented in CLAUDE.md.
   */
  async searchMemoriesGated(
    user: RequestUser,
    query: string,
    limit = 20,
  ): Promise<Array<Record<string, unknown>>> {
    const [personalMemories, orgRaw] = await Promise.all([
      this.searchMemories(user.userId, query, limit),
      this.searchMemories(user.organizationId, query, limit),
    ]);

    const orgMemories = await this.filterOrgDrafts(orgRaw, user);

    const seen = new Set<string>();
    const merged: Array<Record<string, unknown>> = [];
    for (const mem of [...personalMemories, ...orgMemories]) {
      const id = mem.id as string;
      if (id && !seen.has(id)) {
        seen.add(id);
        merged.push(mem);
      }
    }
    merged.sort((a, b) => ((b.score as number) ?? 0) - ((a.score as number) ?? 0));
    return merged;
  }

  /**
   * Filter org memories by draft gating rules.
   * - Published or no status: included
   * - Author's own drafts: included
   * - Other users' drafts: lazy-promoted if task done, lazy-deleted if cancelled, hidden if pending
   */
  async filterOrgDrafts(
    memories: Array<Record<string, unknown>>,
    user: RequestUser,
  ): Promise<Array<Record<string, unknown>>> {
    const draftTaskIds = new Set<string>();
    for (const mem of memories) {
      const metadata = mem.metadata as Record<string, unknown> | null;
      if (!metadata) continue;
      const status = metadata.status as string | undefined;
      if (status === 'draft' && metadata.author_id !== user.userId) {
        const taskId = metadata.taskId as string | undefined;
        if (taskId && !this.publishedTaskCache.has(taskId)) {
          draftTaskIds.add(taskId);
        }
      }
    }

    if (draftTaskIds.size > 0 && this.tasksService) {
      try {
        const tasks = await this.tasksService.getTasks(user.organizationId, {});
        const taskMap = new Map(tasks.map((t) => [t.id, t.status]));
        for (const taskId of draftTaskIds) {
          const s = taskMap.get(taskId);
          if (s === 'done') this.publishedTaskCache.set(taskId, true);
          else if (s === 'cancelled') this.publishedTaskCache.set(taskId, false);
          else this.publishedTaskCache.set(taskId, false);
        }
      } catch {
        // If task fetch fails, treat all as pending
      }
    }

    const filtered: Array<Record<string, unknown>> = [];

    for (const mem of memories) {
      const metadata = mem.metadata as Record<string, unknown> | null;
      if (!metadata) { filtered.push(mem); continue; }

      const status = metadata.status as string | undefined;
      if (status === 'published' || !status) { filtered.push(mem); continue; }

      if (status === 'draft') {
        if (metadata.author_id === user.userId) { filtered.push(mem); continue; }

        const taskId = metadata.taskId as string | undefined;
        if (taskId) {
          const taskStatus = await this.getTaskFinalStatus(taskId, metadata, user);
          if (taskStatus === 'done') {
            metadata.status = 'published';
            this.memoryOpsQueue?.add('mcp-tool-call', {
              type: 'mcp-tool-call',
              toolName: 'update_memory',
              args: { memory_id: mem.id as string, metadata: { status: 'published' } },
              userId: user.userId,
            });
            filtered.push(mem);
          } else if (taskStatus === 'cancelled') {
            this.memoryOpsQueue?.add('mcp-tool-call', {
              type: 'mcp-tool-call',
              toolName: 'delete_memory',
              args: { memory_id: mem.id as string },
              userId: user.userId,
            });
          }
          // 'pending' — skip
        }
      }
    }

    return filtered;
  }

  /**
   * Check task status for draft promotion.
   * Returns: 'done' (promote), 'cancelled' (delete), 'pending' (keep as draft)
   */
  async getTaskFinalStatus(
    taskId: string,
    metadata: Record<string, unknown>,
    user: RequestUser,
  ): Promise<'done' | 'cancelled' | 'pending'> {
    const cacheKey = metadata.prUrl ? `${taskId}:${metadata.prNumber}` : taskId;
    const cached = this.publishedTaskCache.get(cacheKey);
    if (cached === true) return 'done';
    if (cached === false) return 'pending';

    // Prefer GitHub PR state when available
    const repo = metadata.repo as string | undefined;
    const prNumber = metadata.prNumber as number | undefined;
    if (repo && prNumber && this.integrationsService) {
      try {
        const ghIntegration = await this.integrationsService.findOne(user.organizationId, 'github');
        const pr = await githubFetch<{ merged: boolean; state: string }>(
          `https://api.github.com/repos/${repo}/pulls/${prNumber}`,
          ghIntegration.access_token,
        );
        if (pr.merged) {
          this.publishedTaskCache.set(cacheKey, true);
          return 'done';
        }
        if (pr.state === 'closed' && !pr.merged) return 'cancelled';
        this.publishedTaskCache.set(cacheKey, false);
        return 'pending';
      } catch {
        // Fall through to ticket-system check
      }
    }

    if (!this.tasksService) return 'pending';

    try {
      const tasks = await this.tasksService.getTasks(user.organizationId, {});
      const task = tasks.find((t) => t.id === taskId);
      if (task?.status === 'done') {
        this.publishedTaskCache.set(cacheKey, true);
        return 'done';
      }
      if (task?.status === 'cancelled') return 'cancelled';
      this.publishedTaskCache.set(cacheKey, false);
      return 'pending';
    } catch {
      return 'pending';
    }
  }

  // ---- Helpers ----

  /** Extract memory array from various response shapes */
  private extractMemoryArray(data: Record<string, unknown>): Array<Record<string, unknown>> {
    if (Array.isArray(data)) return data;
    // Mem0 Cloud: { results: [...] }
    if (Array.isArray(data.results)) return data.results as Array<Record<string, unknown>>;
    // mem0 OSS: { memories: [...] } or { items: [...] }
    if (Array.isArray(data.memories)) return data.memories as Array<Record<string, unknown>>;
    if (Array.isArray(data.items)) return data.items as Array<Record<string, unknown>>;
    return [];
  }
}
