import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  Logger,
  BadGatewayException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';
import { MemoryService } from './memory.service.js';
import { TasksService } from '../integrations/tasks.service.js';

@Controller('memory')
@UseGuards(JwtAuthGuard)
export class MemoryController {
  private readonly logger = new Logger(MemoryController.name);
  private readonly publishedTaskCache = new Map<string, boolean>();

  constructor(
    private readonly memoryService: MemoryService,
    private readonly tasksService: TasksService,
  ) {}

  @Get('config')
  getConfig(@Req() req: Request): { type: string; url: string } {
    const proto = req.headers['x-forwarded-proto'] ?? req.protocol;
    const host = req.headers['x-forwarded-host'] ?? req.get('host');
    const baseUrl = `${proto}://${host}`;

    if (this.memoryService.isMem0Cloud) {
      // Mem0 Cloud uses HTTP streamable transport
      return {
        type: 'http',
        url: `${baseUrl}/api/memory/mcp`,
      };
    }
    // OSS OpenMemory uses SSE transport
    return {
      type: 'sse',
      url: `${baseUrl}/api/memory/sse`,
    };
  }

  @Post('mcp')
  async proxyMcp(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ): Promise<void> {
    const upstreamUrl = this.memoryService.getUpstreamSseUrl(user.userId);
    const upstreamHeaders = this.memoryService.getUpstreamMessageHeaders();

    // Check if this is a search/get that needs dual-scope (personal + org)
    const rpc = body as Record<string, unknown> | null;
    const isSearch = rpc?.method === 'tools/call' && this.isSearchOrGetTool(rpc);

    if (isSearch) {
      // Dual-scope search: personal (user_id) + org (app_id)
      await this.dualScopeSearch(body, user, upstreamUrl, upstreamHeaders, res);
      return;
    }

    // For non-search calls: inject user_id and optionally app_id
    const enrichedBody = this.injectScoping(body, user.userId, user.organizationId);

    let upstreamResponse: globalThis.Response;
    try {
      upstreamResponse = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          ...upstreamHeaders,
          'Accept': 'text/event-stream, application/json',
        },
        body: JSON.stringify(enrichedBody),
      });
    } catch (err) {
      this.logger.error(`Failed to connect to upstream MCP: ${err}`);
      res.status(502).json({ error: 'Failed to connect to memory server' });
      return;
    }

    if (!upstreamResponse.ok) {
      const text = await upstreamResponse.text().catch(() => '');
      this.logger.error(`Upstream MCP returned ${upstreamResponse.status}: ${text}`);
      res.status(upstreamResponse.status).json({ error: `Memory server returned ${upstreamResponse.status}` });
      return;
    }

    const contentType = upstreamResponse.headers.get('content-type') ?? '';

    if (contentType.includes('text/event-stream') && upstreamResponse.body) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const reader = upstreamResponse.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
      } catch {
        // Client disconnected
      } finally {
        res.end();
      }
    } else {
      const json = await upstreamResponse.json().catch(() => ({}));
      res.status(upstreamResponse.status).json(json);
    }
  }

  @Get('sse')
  async proxySse(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const upstreamUrl = this.memoryService.getUpstreamSseUrl(user.userId);
    const upstreamHeaders = this.memoryService.getUpstreamHeaders();

    // Derive the backend's own base URL for rewriting endpoint events
    const proto = req.headers['x-forwarded-proto'] ?? req.protocol;
    const host = req.headers['x-forwarded-host'] ?? req.get('host');
    const backendBaseUrl = `${proto}://${host}/api/memory`;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let upstreamResponse: globalThis.Response;
    try {
      upstreamResponse = await fetch(upstreamUrl, {
        headers: upstreamHeaders,
      });
    } catch (err) {
      this.logger.error(`Failed to connect to upstream MCP: ${err}`);
      res.write(`event: error\ndata: {"error":"Failed to connect to memory server"}\n\n`);
      res.end();
      return;
    }

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      this.logger.error(`Upstream MCP returned ${upstreamResponse.status}`);
      res.write(`event: error\ndata: {"error":"Memory server returned ${upstreamResponse.status}"}\n\n`);
      res.end();
      return;
    }

    const reader = upstreamResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Clean up on client disconnect
    const cleanup = () => {
      reader.cancel().catch(() => {});
    };
    req.on('close', cleanup);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (delimited by \n\n)
        let delimiterIndex: number;
        while ((delimiterIndex = buffer.indexOf('\n\n')) !== -1) {
          const message = buffer.slice(0, delimiterIndex + 2);
          buffer = buffer.slice(delimiterIndex + 2);

          // Check if this is an endpoint event that needs URL rewriting
          if (message.includes('event: endpoint') || message.includes('event:endpoint')) {
            const rewritten = this.rewriteEndpointEvent(message, backendBaseUrl);
            res.write(rewritten);
          } else {
            res.write(message);
          }
        }
      }
    } catch (err) {
      // Client disconnected or upstream closed — this is normal for SSE
      if ((err as { name?: string }).name !== 'AbortError') {
        this.logger.warn(`SSE proxy stream ended: ${err}`);
      }
    } finally {
      req.off('close', cleanup);
      res.end();
    }
  }

  @Post('messages')
  async proxyMessage(
    @CurrentUser() user: RequestUser,
    @Query('sessionId') sessionId: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    // Look up the upstream message URL from the session
    // The upstream endpoint URL was captured during SSE connection
    const upstreamBaseUrl = this.memoryService.getUpstreamSseUrl(user.userId);
    // Derive the messages endpoint from the SSE URL (replace /sse with /messages)
    const baseUrl = upstreamBaseUrl.replace(/\/sse(\/.*)?$/, '');
    const upstreamUrl = `${baseUrl}/messages?sessionId=${encodeURIComponent(sessionId)}`;

    const upstreamHeaders = this.memoryService.getUpstreamMessageHeaders();

    const response = await fetch(upstreamUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new BadGatewayException(`Memory server returned ${response.status}: ${text}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    return { success: true };
  }

  /**
   * Rewrite the endpoint URL in an SSE endpoint event to point to our proxy.
   * Upstream sends: event: endpoint\ndata: https://mcp.mem0.ai/mcp/messages?sessionId=xxx
   * We rewrite to: event: endpoint\ndata: https://api.tandemu.dev/api/memory/messages?sessionId=xxx
   */
  private rewriteEndpointEvent(message: string, backendBaseUrl: string): string {
    const lines = message.split('\n');
    const rewritten = lines.map((line) => {
      if (line.startsWith('data:')) {
        const url = line.slice(5).trim();
        // Extract sessionId from the upstream URL
        try {
          const parsed = new URL(url);
          const sessionId = parsed.searchParams.get('sessionId') ?? '';
          return `data: ${backendBaseUrl}/messages?sessionId=${encodeURIComponent(sessionId)}`;
        } catch {
          // If URL parsing fails, try regex extraction
          const sessionMatch = url.match(/sessionId=([^&\s]+)/);
          const sessionId = sessionMatch?.[1] ?? '';
          return `data: ${backendBaseUrl}/messages?sessionId=${encodeURIComponent(sessionId)}`;
        }
      }
      return line;
    });
    return rewritten.join('\n');
  }

  /**
   * Check if a tool call is a search or get operation that needs dual-scope.
   */
  private isSearchOrGetTool(rpc: Record<string, unknown>): boolean {
    const params = rpc.params as Record<string, unknown> | undefined;
    const toolName = params?.name as string | undefined;
    return toolName === 'search_memories' || toolName === 'get_memories';
  }

  /**
   * Inject scoping into MCP tool call arguments.
   * - user_id: always injected for personal scope
   * - app_id: injected when Claude passes app_id: "org" (replaced with actual orgId)
   * - metadata: for add_memory, inject draft status with taskId for org memories
   */
  private injectScoping(body: unknown, userId: string, organizationId: string): unknown {
    if (!body || typeof body !== 'object') return body;
    const rpc = body as Record<string, unknown>;

    if (rpc.method === 'tools/call' && rpc.params && typeof rpc.params === 'object') {
      const params = rpc.params as Record<string, unknown>;
      if (params.arguments && typeof params.arguments === 'object') {
        const args = params.arguments as Record<string, unknown>;

        // Check if this is an org-scoped memory (app_id: "org")
        const isOrgScope = args.app_id === 'org';

        if (isOrgScope) {
          // Replace "org" sentinel with actual organization ID
          args.app_id = organizationId;
          // Don't set user_id for org memories — they're shared
          // But add metadata for draft gating
          if (!args.metadata || typeof args.metadata !== 'object') {
            args.metadata = {};
          }
          const metadata = args.metadata as Record<string, unknown>;
          metadata.status = metadata.status ?? 'draft';
          metadata.author_id = userId;
        } else {
          // Personal memory — inject user_id
          if (!args.user_id) {
            args.user_id = userId;
          }
          // Ensure filters include user_id for search/get
          if (!args.filters) {
            args.filters = { user_id: userId };
          } else if (typeof args.filters === 'object') {
            const filters = args.filters as Record<string, unknown>;
            if (!filters.user_id) {
              filters.user_id = userId;
            }
          }
        }
      }
    }

    return body;
  }

  /**
   * Dual-scope search: query personal memories (user_id) + org memories (app_id),
   * merge results, and filter drafts from other users.
   */
  private async dualScopeSearch(
    body: unknown,
    user: RequestUser,
    upstreamUrl: string,
    upstreamHeaders: Record<string, string>,
    res: Response,
  ): Promise<void> {
    const rpc = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
    const params = rpc.params as Record<string, unknown>;
    const args = (params.arguments ?? {}) as Record<string, unknown>;

    // Build personal search body
    const personalBody = JSON.parse(JSON.stringify(body));
    const personalArgs = (personalBody.params as Record<string, unknown>).arguments as Record<string, unknown>;
    personalArgs.user_id = user.userId;
    if (!personalArgs.filters) personalArgs.filters = { user_id: user.userId };

    // Build org search body
    const orgBody = JSON.parse(JSON.stringify(body));
    const orgArgs = (orgBody.params as Record<string, unknown>).arguments as Record<string, unknown>;
    delete orgArgs.user_id;
    orgArgs.app_id = user.organizationId;
    orgArgs.filters = { app_id: user.organizationId };

    const fetchUpstream = async (reqBody: unknown) => {
      const response = await fetch(upstreamUrl, {
        method: 'POST',
        headers: { ...upstreamHeaders, 'Accept': 'text/event-stream, application/json' },
        body: JSON.stringify(reqBody),
      });
      if (!response.ok) return null;
      return response.json().catch(() => null);
    };

    try {
      const [personalResult, orgResult] = await Promise.all([
        fetchUpstream(personalBody),
        fetchUpstream(orgBody),
      ]);

      // Extract results from MCP JSON-RPC responses
      const personalMemories = this.extractMemories(personalResult);
      const orgMemories = this.extractMemories(orgResult);

      // Lazy-evaluate draft org memories:
      // - Author's own drafts: always shown
      // - Other users' drafts: check if the task is done → promote to published
      // - Published: always shown
      const filteredOrgMemories: Array<Record<string, unknown>> = [];
      for (const mem of orgMemories) {
        const metadata = mem.metadata as Record<string, unknown> | null;
        if (!metadata) { filteredOrgMemories.push(mem); continue; }

        const status = metadata.status as string | undefined;
        if (status === 'published' || !status) { filteredOrgMemories.push(mem); continue; }

        if (status === 'draft') {
          // Author always sees their own drafts
          if (metadata.author_id === user.userId) { filteredOrgMemories.push(mem); continue; }

          // For other users' drafts: check if the task is finalized
          const taskId = metadata.taskId as string | undefined;
          if (taskId) {
            const taskStatus = await this.getTaskFinalStatus(taskId, user);
            if (taskStatus === 'done') {
              // Promote to published — update the memory asynchronously
              metadata.status = 'published';
              this.promoteMemory(mem.id as string, upstreamUrl, upstreamHeaders).catch(() => {});
              filteredOrgMemories.push(mem);
            } else if (taskStatus === 'cancelled') {
              // Cancelled work — delete the draft, knowledge may be invalid
              this.deleteMemory(mem.id as string, upstreamUrl, upstreamHeaders).catch(() => {});
              // Don't include in results
            }
            // 'pending' — skip, draft from unmerged work
          }
        }
      }

      // Merge and deduplicate by ID
      const seen = new Set<string>();
      const merged: Array<Record<string, unknown>> = [];
      for (const mem of [...personalMemories, ...filteredOrgMemories]) {
        const id = mem.id as string;
        if (id && !seen.has(id)) {
          seen.add(id);
          merged.push(mem);
        }
      }

      // Sort by score descending
      merged.sort((a, b) => ((b.score as number) ?? 0) - ((a.score as number) ?? 0));

      // Reconstruct the MCP response
      const responseBody = personalResult ?? orgResult;
      if (responseBody && typeof responseBody === 'object') {
        const result = responseBody as Record<string, unknown>;
        if (result.result && typeof result.result === 'object') {
          // Tool result contains stringified JSON
          const toolResult = result.result as Record<string, unknown>;
          if (typeof toolResult.content === 'object' && Array.isArray(toolResult.content)) {
            const content = toolResult.content as Array<Record<string, unknown>>;
            if (content[0] && content[0].text) {
              content[0].text = JSON.stringify({ results: merged });
            }
          }
        } else if (typeof result.result === 'string') {
          try {
            const parsed = JSON.parse(result.result as string);
            parsed.results = merged;
            result.result = JSON.stringify(parsed);
          } catch {
            // Not JSON string, return as-is
          }
        }
        res.json(responseBody);
      } else {
        res.json({ result: JSON.stringify({ results: merged }) });
      }
    } catch (err) {
      this.logger.error(`Dual-scope search failed: ${err}`);
      res.status(502).json({ error: 'Memory search failed' });
    }
  }

  /**
   * Extract memory objects from an MCP tool response.
   */
  private extractMemories(result: unknown): Array<Record<string, unknown>> {
    if (!result || typeof result !== 'object') return [];
    const rpc = result as Record<string, unknown>;

    let resultsStr = '';
    if (typeof rpc.result === 'string') {
      resultsStr = rpc.result;
    } else if (rpc.result && typeof rpc.result === 'object') {
      const toolResult = rpc.result as Record<string, unknown>;
      if (Array.isArray(toolResult.content)) {
        const content = toolResult.content as Array<Record<string, unknown>>;
        resultsStr = (content[0]?.text as string) ?? '';
      }
    }

    try {
      const parsed = JSON.parse(resultsStr);
      return Array.isArray(parsed.results) ? parsed.results : [];
    } catch {
      return [];
    }
  }

  /**
   * Check task status for draft memory promotion.
   * Returns: 'done' (promote), 'cancelled' (delete), 'pending' (keep as draft)
   */
  private async getTaskFinalStatus(taskId: string, user: RequestUser): Promise<'done' | 'cancelled' | 'pending'> {
    const cached = this.publishedTaskCache.get(taskId);
    if (cached === true) return 'done';
    if (cached === false) return 'pending';

    try {
      const tasks = await this.tasksService.getTasks(user.organizationId, {});
      const task = tasks.find((t) => t.id === taskId);
      if (task?.status === 'done') {
        this.publishedTaskCache.set(taskId, true);
        return 'done';
      }
      if (task?.status === 'cancelled') {
        return 'cancelled';
      }
      this.publishedTaskCache.set(taskId, false);
      return 'pending';
    } catch {
      return 'pending';
    }
  }

  /**
   * Promote a draft memory to published by updating its metadata.
   */
  private async promoteMemory(
    memoryId: string,
    upstreamUrl: string,
    upstreamHeaders: Record<string, string>,
  ): Promise<void> {
    try {
      await fetch(upstreamUrl, {
        method: 'POST',
        headers: { ...upstreamHeaders, 'Accept': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `promote-${memoryId}`,
          method: 'tools/call',
          params: {
            name: 'update_memory',
            arguments: {
              memory_id: memoryId,
              metadata: { status: 'published' },
            },
          },
        }),
      });
    } catch (err) {
      this.logger.warn(`Failed to promote memory ${memoryId}: ${err}`);
    }
  }

  /**
   * Delete a memory (e.g., from cancelled task — knowledge may be invalid).
   */
  private async deleteMemory(
    memoryId: string,
    upstreamUrl: string,
    upstreamHeaders: Record<string, string>,
  ): Promise<void> {
    try {
      await fetch(upstreamUrl, {
        method: 'POST',
        headers: { ...upstreamHeaders, 'Accept': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `delete-${memoryId}`,
          method: 'tools/call',
          params: {
            name: 'delete_memory',
            arguments: { memory_id: memoryId },
          },
        }),
      });
    } catch (err) {
      this.logger.warn(`Failed to delete memory ${memoryId}: ${err}`);
    }
  }

}
