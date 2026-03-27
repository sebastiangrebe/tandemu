import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  Logger,
  BadGatewayException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CurrentUser, Roles } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';
import { MembershipRole } from '@tandemu/types';
import { MemoryScope } from '@tandemu/types';
import type { MemoryEntry, MemoryListResponse, MemoryStatsResponse } from '@tandemu/types';
import { MemoryService } from './memory.service.js';
import { TasksService } from '../integrations/tasks.service.js';

@Controller('memory')
@UseGuards(JwtAuthGuard, RolesGuard)
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
      // Mem0 Cloud returns SSE with JSON-RPC payloads in "data:" lines.
      // Claude Code's HTTP MCP client expects plain JSON-RPC responses.
      // Buffer the SSE, extract the JSON-RPC payload, and return as JSON.
      const reader = upstreamResponse.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
        }
      } catch {
        // Stream ended
      }

      // Extract JSON-RPC payload from SSE "data:" lines
      const dataLines = fullText.split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());

      if (dataLines.length > 0) {
        try {
          const jsonPayload = JSON.parse(dataLines[dataLines.length - 1]);
          res.setHeader('Content-Type', 'application/json');
          res.status(200).json(jsonPayload);
          return;
        } catch {
          // Failed to parse — fall through to raw response
        }
      }

      // Fallback: return raw text
      res.setHeader('Content-Type', 'text/plain');
      res.status(200).send(fullText);
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
      return this.parseUpstreamResponse(response);
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
              this.deleteMemoryUpstream(mem.id as string, upstreamUrl, upstreamHeaders).catch(() => {});
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
  /**
   * Parse upstream response — handles both SSE (text/event-stream) and JSON.
   * Mem0 Cloud returns SSE; we extract the JSON-RPC payload from "data:" lines.
   */
  private async parseUpstreamResponse(response: globalThis.Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('text/event-stream') && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
        }
      } catch {
        // Stream ended
      }

      const dataLines = fullText.split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());

      if (dataLines.length > 0) {
        try {
          return JSON.parse(dataLines[dataLines.length - 1]);
        } catch {
          return null;
        }
      }
      return null;
    }

    return response.json().catch(() => null);
  }

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
  private async deleteMemoryUpstream(
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

  // ---- Shared MCP helper ----

  /**
   * Call an MCP tool on the upstream Mem0 server and return the parsed result.
   * Handles both Mem0 Cloud (direct POST) and OpenMemory OSS (SSE handshake → POST to /messages).
   */
  private async callMcpTool(
    toolName: string,
    args: Record<string, unknown>,
    user: RequestUser,
  ): Promise<unknown> {
    const upstreamUrl = this.memoryService.getUpstreamSseUrl(user.userId);
    const upstreamHeaders = this.memoryService.getUpstreamMessageHeaders();

    const body = {
      jsonrpc: '2.0',
      id: `dashboard-${toolName}-${Date.now()}`,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    };

    if (this.memoryService.isMem0Cloud) {
      // Mem0 Cloud: direct POST to /mcp endpoint
      const response = await fetch(upstreamUrl, {
        method: 'POST',
        headers: { ...upstreamHeaders, 'Accept': 'text/event-stream, application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new BadGatewayException(`Memory server returned ${response.status}: ${text}`);
      }

      return this.parseUpstreamResponse(response);
    }

    // OpenMemory OSS: SSE handshake first, then POST to /messages
    const messagesUrl = await this.getOpenMemoryMessagesUrl(upstreamUrl, upstreamHeaders);

    const response = await fetch(messagesUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new BadGatewayException(`Memory server returned ${response.status}: ${text}`);
    }

    return this.parseUpstreamResponse(response);
  }

  /**
   * Establish an SSE session with OpenMemory and extract the messages endpoint URL.
   */
  private async getOpenMemoryMessagesUrl(
    sseUrl: string,
    headers: Record<string, string>,
  ): Promise<string> {
    const controller = new AbortController();
    // Timeout the SSE handshake after 10 seconds
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const fetchOpts: Record<string, unknown> = {
        headers: { ...headers, 'Accept': 'text/event-stream' },
        signal: controller.signal,
      };
      const response = await fetch(sseUrl, fetchOpts as RequestInit);

      if (!response.ok || !response.body) {
        throw new BadGatewayException(`OpenMemory SSE returned ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Read SSE events until we find the endpoint event
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Look for the endpoint event
        if (buffer.includes('event: endpoint') || buffer.includes('event:endpoint')) {
          const lines = buffer.split('\n');
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const messagesUrl = line.slice(5).trim();
              // Clean up: cancel the SSE stream
              reader.cancel().catch(() => {});
              return messagesUrl;
            }
          }
        }
      }

      throw new BadGatewayException('OpenMemory SSE did not provide an endpoint event');
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Filter org memories by draft gating rules.
   * - Published or no status: always included
   * - Author's own drafts: included
   * - Other users' drafts: promoted if task done, deleted if cancelled, hidden if pending
   */
  private async filterOrgDrafts(
    memories: Array<Record<string, unknown>>,
    user: RequestUser,
  ): Promise<Array<Record<string, unknown>>> {
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
          const taskStatus = await this.getTaskFinalStatus(taskId, user);
          if (taskStatus === 'done') {
            metadata.status = 'published';
            this.callMcpTool('update_memory', {
              memory_id: mem.id as string,
              metadata: { status: 'published' },
            }, user).catch(() => {});
            filtered.push(mem);
          } else if (taskStatus === 'cancelled') {
            this.callMcpTool('delete_memory', {
              memory_id: mem.id as string,
            }, user).catch(() => {});
          }
          // 'pending' — skip
        }
      }
    }

    return filtered;
  }

  // ---- Dashboard REST endpoints ----

  /**
   * List memories by scope with server-side pagination.
   */
  @Get('list')
  async listMemories(
    @CurrentUser() user: RequestUser,
    @Query('scope') scope: string = 'personal',
    @Query('limit') limitStr: string = '50',
    @Query('offset') offsetStr: string = '0',
  ): Promise<MemoryListResponse> {
    const limit = Math.min(parseInt(limitStr, 10) || 50, 200);
    const offset = parseInt(offsetStr, 10) || 0;

    const args: Record<string, unknown> = {};
    if (scope === 'org') {
      args.app_id = user.organizationId;
      args.filters = { app_id: user.organizationId };
    } else {
      args.user_id = user.userId;
      args.filters = { user_id: user.userId };
    }

    const result = await this.callMcpTool('get_memories', args, user);
    let memories = this.extractMemories(result);

    if (scope === 'org') {
      memories = await this.filterOrgDrafts(memories, user);
    }

    const total = memories.length;
    const sliced = memories.slice(offset, offset + limit);

    return {
      memories: sliced.map((m) => this.toMemoryEntry(m, scope === 'org' ? 'org' : 'personal')),
      total,
    };
  }

  /**
   * Semantic search across memory scopes.
   */
  @Get('search')
  async searchMemoriesRest(
    @CurrentUser() user: RequestUser,
    @Query('q') query: string,
    @Query('scope') scope: string = 'all',
    @Query('limit') limitStr: string = '20',
  ): Promise<{ memories: MemoryEntry[] }> {
    if (!query) throw new BadRequestException('Query parameter "q" is required');
    const limit = Math.min(parseInt(limitStr, 10) || 20, 100);

    if (scope === 'all') {
      // Dual-scope search: personal + org
      const [personalResult, orgResult] = await Promise.all([
        this.callMcpTool('search_memories', {
          query,
          user_id: user.userId,
          filters: { user_id: user.userId },
          limit,
        }, user),
        this.callMcpTool('search_memories', {
          query,
          app_id: user.organizationId,
          filters: { app_id: user.organizationId },
          limit,
        }, user),
      ]);

      const personalMemories = this.extractMemories(personalResult);
      let orgMemories = this.extractMemories(orgResult);
      orgMemories = await this.filterOrgDrafts(orgMemories, user);

      // Merge, deduplicate, sort by score
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

      return {
        memories: merged.slice(0, limit).map((m) => {
          // Determine scope from presence of app_id in the org results
          const isOrg = orgMemories.some((o) => (o.id as string) === (m.id as string));
          return this.toMemoryEntry(m, isOrg ? 'org' : 'personal');
        }),
      };
    }

    // Single-scope search
    const args: Record<string, unknown> = { query, limit };
    if (scope === 'org') {
      args.app_id = user.organizationId;
      args.filters = { app_id: user.organizationId };
    } else {
      args.user_id = user.userId;
      args.filters = { user_id: user.userId };
    }

    const result = await this.callMcpTool('search_memories', args, user);
    let memories = this.extractMemories(result);

    if (scope === 'org') {
      memories = await this.filterOrgDrafts(memories, user);
    }

    return {
      memories: memories.map((m) => this.toMemoryEntry(m, scope === 'org' ? 'org' : 'personal')),
    };
  }

  /**
   * Get memory stats: counts by scope + category breakdown.
   */
  @Get('stats')
  async getStats(
    @CurrentUser() user: RequestUser,
  ): Promise<MemoryStatsResponse> {
    const [personalResult, orgResult] = await Promise.all([
      this.callMcpTool('get_memories', {
        user_id: user.userId,
        filters: { user_id: user.userId },
      }, user),
      this.callMcpTool('get_memories', {
        app_id: user.organizationId,
        filters: { app_id: user.organizationId },
      }, user),
    ]);

    const personalMemories = this.extractMemories(personalResult);
    const orgMemories = await this.filterOrgDrafts(
      this.extractMemories(orgResult),
      user,
    );

    // Category breakdown from all memories
    const categories: Record<string, number> = {};
    for (const mem of [...personalMemories, ...orgMemories]) {
      const metadata = mem.metadata as Record<string, unknown> | null;
      const category = (metadata?.category as string) ?? 'uncategorized';
      categories[category] = (categories[category] ?? 0) + 1;
    }

    return {
      personal: personalMemories.length,
      org: orgMemories.length,
      total: personalMemories.length + orgMemories.length,
      categories,
    };
  }

  /**
   * Update a memory's content.
   */
  @Patch(':id')
  async updateMemoryRest(
    @CurrentUser() user: RequestUser,
    @Param('id') memoryId: string,
    @Body() body: { content?: string; metadata?: Record<string, unknown> },
  ): Promise<{ success: boolean }> {
    const args: Record<string, unknown> = { memory_id: memoryId };
    if (body.content !== undefined) {
      args.text = body.content;
    }
    if (body.metadata) {
      args.metadata = body.metadata;
    }

    await this.callMcpTool('update_memory', args, user);
    return { success: true };
  }

  /**
   * Delete a memory by ID.
   */
  @Delete(':id')
  async deleteMemoryRest(
    @CurrentUser() user: RequestUser,
    @Param('id') memoryId: string,
  ): Promise<{ success: boolean }> {
    await this.callMcpTool('delete_memory', { memory_id: memoryId }, user);
    return { success: true };
  }

  /**
   * Admin: approve (promote) a draft org memory to published.
   */
  @Post(':id/approve')
  @Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
  async approveMemory(
    @CurrentUser() user: RequestUser,
    @Param('id') memoryId: string,
  ): Promise<{ success: boolean }> {
    await this.callMcpTool('update_memory', {
      memory_id: memoryId,
      metadata: { status: 'published' },
    }, user);
    return { success: true };
  }

  // ---- Helpers ----

  /**
   * Convert a raw Mem0 memory object to a typed MemoryEntry.
   */
  private toMemoryEntry(raw: Record<string, unknown>, scope: string): MemoryEntry {
    return {
      id: (raw.id as string) ?? '',
      content: (raw.memory as string) ?? (raw.content as string) ?? '',
      scope: scope === 'org' ? MemoryScope.AGENT : MemoryScope.USER,
      metadata: (raw.metadata as Record<string, unknown>) ?? {},
      createdAt: (raw.created_at as string) ?? (raw.createdAt as string) ?? '',
      updatedAt: (raw.updated_at as string) ?? (raw.updatedAt as string) ?? '',
      score: raw.score as number | undefined,
    };
  }

}
