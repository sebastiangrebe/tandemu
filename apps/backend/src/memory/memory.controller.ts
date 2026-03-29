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
import { createHash } from 'crypto';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { CurrentUser, Roles } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';
import { MembershipRole } from '@tandemu/types';
import { MemoryScope } from '@tandemu/types';
import type { MemoryEntry, MemoryListResponse, MemoryStatsResponse, FileTreeNode, GapEntry } from '@tandemu/types';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { MemoryService } from './memory.service.js';
import { TasksService } from '../integrations/tasks.service.js';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { MemoryOpsJobData, TelemetryJobData } from '../queue/queue.types.js';

@Controller('memory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MemoryController {
  private readonly logger = new Logger(MemoryController.name);
  private readonly publishedTaskCache = new Map<string, boolean>();
  private readonly userNameCache = new Map<string, string>();

  constructor(
    private readonly memoryService: MemoryService,
    private readonly tasksService: TasksService,
    private readonly telemetryService: TelemetryService,
    private readonly authService: AuthService,
    @InjectQueue('memory-ops') private readonly memoryOpsQueue: Queue<MemoryOpsJobData>,
    @InjectQueue('telemetry') private readonly telemetryQueue: Queue<TelemetryJobData>,
  ) {}

  private async resolveUserName(userId: string): Promise<string | undefined> {
    const cached = this.userNameCache.get(userId);
    if (cached) return cached;
    try {
      const user = await this.authService.getMe(userId);
      if (user?.name) {
        this.userNameCache.set(userId, user.name);
        return user.name;
      }
    } catch {
      // Ignore lookup failures — name is optional enrichment
    }
    return undefined;
  }

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
      // Dual-scope search: personal (user_id) + org (user_id = orgId)
      await this.dualScopeSearch(body, user, upstreamUrl, upstreamHeaders, res);
      return;
    }

    // For non-search calls: inject user_id (personal or orgId for org scope)
    const enrichedBody = await this.injectScoping(body, user.userId, user.organizationId);

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
   * - org scope: when Claude passes app_id: "org", replaced with user_id: orgId
   * - metadata: for add_memory, inject draft status with taskId for org memories
   */
  private async injectScoping(body: unknown, userId: string, organizationId: string): Promise<unknown> {
    if (!body || typeof body !== 'object') return body;
    const rpc = body as Record<string, unknown>;

    if (rpc.method === 'tools/call' && rpc.params && typeof rpc.params === 'object') {
      const params = rpc.params as Record<string, unknown>;
      const toolName = params.name as string | undefined;
      if (params.arguments && typeof params.arguments === 'object') {
        const args = params.arguments as Record<string, unknown>;

        // Check if this is an org-scoped memory (app_id: "org")
        const isOrgScope = args.app_id === 'org';

        if (isOrgScope) {
          // Org memories: use organizationId as the Mem0 user_id.
          // Mem0 Cloud scopes by user_id — using orgId makes all org memories
          // live under a single "user" entity representing the org.
          // Don't use app_id — it doesn't reliably scope on Mem0 Cloud.
          delete args.app_id;
          args.user_id = organizationId;
          // Add metadata for draft gating
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

        // Enrich add_memory with author_name and source
        if (toolName === 'add_memory') {
          if (!args.metadata || typeof args.metadata !== 'object') {
            args.metadata = {};
          }
          const metadata = args.metadata as Record<string, unknown>;
          if (!metadata.author_name) {
            const name = await this.resolveUserName(userId);
            if (name) metadata.author_name = name;
          }
          if (!metadata.source) {
            metadata.source = 'mcp';
          }
          // Normalize repo to owner/name format (e.g. "sebastiangrebe/tandemu").
          // Callers may pass a local path (/Users/.../Git/tandemu), a GitHub URL
          // (https://github.com/owner/repo.git), or already-normalized owner/repo.
          if (typeof metadata.repo === 'string' && metadata.repo) {
            const raw = metadata.repo.replace(/\/+$/, '').replace(/\.git$/, '');
            const ghMatch = raw.match(/github\.com\/([^/]+\/[^/]+)/);
            if (ghMatch) {
              // GitHub URL → owner/repo
              metadata.repo = ghMatch[1];
            } else if (raw.includes('/') && !raw.startsWith('/')) {
              // Already looks like owner/repo — keep as-is
            } else {
              // Local path — can't derive owner, store just the repo name.
              // The /finish skill and CLAUDE.md should pass owner/repo instead.
              const segments = raw.split('/').filter(Boolean);
              metadata.repo = segments[segments.length - 1] ?? metadata.repo;
            }
          }
        }
      }
    }

    return body;
  }

  /**
   * Dual-scope search: query personal memories (user_id) + org memories (user_id = orgId),
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

    // Build org search body — org memories are stored under user_id = organizationId
    const orgBody = JSON.parse(JSON.stringify(body));
    const orgArgs = (orgBody.params as Record<string, unknown>).arguments as Record<string, unknown>;
    delete orgArgs.app_id;
    orgArgs.user_id = user.organizationId;
    orgArgs.filters = { user_id: user.organizationId };

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
              this.memoryOpsQueue.add('promote-memory', {
                type: 'promote-memory',
                memoryId: mem.id as string,
                upstreamUrl,
                upstreamHeaders,
              });
              filteredOrgMemories.push(mem);
            } else if (taskStatus === 'cancelled') {
              // Cancelled work — delete the draft, knowledge may be invalid
              this.memoryOpsQueue.add('delete-memory-upstream', {
                type: 'delete-memory-upstream',
                memoryId: mem.id as string,
                upstreamUrl,
                upstreamHeaders,
              });
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


  // ---- Shared MCP helper ----

  /**
   * Fetch memories via the direct REST API (fast) with MCP fallback (OSS).
   * Returns raw memory objects in the same shape as extractMemories expects.
   */
  private async getMemoriesFast(
    scopeUserId: string,
    user: RequestUser,
  ): Promise<Record<string, unknown>[]> {
    const restResults = await this.memoryService.getMemoriesRest(scopeUserId);
    if (restResults.length > 0 || this.memoryService.isMem0Cloud) {
      return restResults;
    }
    // OSS fallback: use MCP
    const result = await this.callMcpTool('get_memories', {
      user_id: scopeUserId,
      filters: { user_id: scopeUserId },
    }, user);
    return this.extractMemories(result);
  }

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
    // Collect all unique task IDs from drafts to batch-lookup statuses
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

    // Single batch fetch of all tasks (instead of N+1 per draft)
    if (draftTaskIds.size > 0) {
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
          const taskStatus = await this.getTaskFinalStatus(taskId, user);
          if (taskStatus === 'done') {
            metadata.status = 'published';
            this.memoryOpsQueue.add('mcp-tool-call', {
              type: 'mcp-tool-call',
              toolName: 'update_memory',
              args: { memory_id: mem.id as string, metadata: { status: 'published' } },
              userId: user.userId,
            });
            filtered.push(mem);
          } else if (taskStatus === 'cancelled') {
            this.memoryOpsQueue.add('mcp-tool-call', {
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

    const scopeUserId = scope === 'org' ? user.organizationId : user.userId;
    let memories = await this.getMemoriesFast(scopeUserId, user);

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
          user_id: user.organizationId,
          filters: { user_id: user.organizationId },
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

      const resultMemories = merged.slice(0, limit).map((m) => {
        const isOrg = orgMemories.some((o) => (o.id as string) === (m.id as string));
        return this.toMemoryEntry(m, isOrg ? 'org' : 'personal');
      });

      // Queue access logging
      this.telemetryQueue.add('memory-access-log', {
        type: 'memory-access-log',
        memoryIds: resultMemories.map((m) => m.id),
        organizationId: user.organizationId,
        userId: user.userId,
        accessType: 'search',
      });

      return { memories: resultMemories };
    }

    // Single-scope search
    const args: Record<string, unknown> = { query, limit };
    if (scope === 'org') {
      args.user_id = user.organizationId;
      args.filters = { user_id: user.organizationId };
    } else {
      args.user_id = user.userId;
      args.filters = { user_id: user.userId };
    }

    const result = await this.callMcpTool('search_memories', args, user);
    let memories = this.extractMemories(result);

    if (scope === 'org') {
      memories = await this.filterOrgDrafts(memories, user);
    }

    const resultMemories = memories.map((m) => this.toMemoryEntry(m, scope === 'org' ? 'org' : 'personal'));

    this.telemetryQueue.add('memory-access-log', {
      type: 'memory-access-log',
      memoryIds: resultMemories.map((m) => m.id),
      organizationId: user.organizationId,
      userId: user.userId,
      accessType: 'search',
    });

    return { memories: resultMemories };
  }

  /**
   * Get memory stats: counts by scope + category breakdown.
   */
  @Get('stats')
  async getStats(
    @CurrentUser() user: RequestUser,
  ): Promise<MemoryStatsResponse> {
    const [personalMemories, orgRaw, accessedIds] = await Promise.all([
      this.getMemoriesFast(user.userId, user),
      this.getMemoriesFast(user.organizationId, user),
      this.telemetryService.getAccessedMemoryIds(user.organizationId, 30),
    ]);

    const orgMemories = await this.filterOrgDrafts(orgRaw, user);

    // Category breakdown from all memories
    const allMemories = [...personalMemories, ...orgMemories];
    const categories: Record<string, number> = {};
    for (const mem of allMemories) {
      const metadata = mem.metadata as Record<string, unknown> | null;
      const category = (metadata?.category as string) ?? 'uncategorized';
      categories[category] = (categories[category] ?? 0) + 1;
    }

    // Count never-accessed memories (exclude those created in last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let neverAccessedCount = 0;
    for (const mem of allMemories) {
      const id = mem.id as string;
      if (accessedIds.has(id)) continue;
      const createdAt = (mem.created_at as string) ?? (mem.createdAt as string) ?? '';
      if (createdAt && new Date(createdAt) > sevenDaysAgo) continue;
      neverAccessedCount++;
    }

    return {
      personal: personalMemories.length,
      org: orgMemories.length,
      total: allMemories.length,
      categories,
      neverAccessedCount,
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

  // ---- Intelligence endpoints ----

  /**
   * Build a file tree from memory metadata.files[] paths.
   */
  @Get('file-tree')
  async getFileTree(
    @CurrentUser() user: RequestUser,
    @Query('scope') scope: string = 'personal',
  ): Promise<{ tree: FileTreeNode[] }> {
    const scopeUserId = scope === 'org' ? user.organizationId : user.userId;
    let memories = await this.getMemoriesFast(scopeUserId, user);

    if (scope === 'org') {
      memories = await this.filterOrgDrafts(memories, user);
    }

    // Build tree from file paths
    const root: FileTreeNode = { name: '', path: '', memoryCount: 0, children: [], memoryIds: [] };

    for (const mem of memories) {
      const metadata = mem.metadata as Record<string, unknown> | null;
      const rawFiles = metadata?.files;
      const files: string[] = Array.isArray(rawFiles) ? rawFiles : typeof rawFiles === 'string' ? [rawFiles] : [];
      const memId = mem.id as string;

      if (files.length === 0) {
        // Uncategorized — attach to a special node
        let uncategorized = root.children.find((c) => c.name === 'Uncategorized');
        if (!uncategorized) {
          uncategorized = { name: 'Uncategorized', path: 'Uncategorized', memoryCount: 0, children: [], memoryIds: [] };
          root.children.push(uncategorized);
        }
        uncategorized.memoryIds.push(memId);
        uncategorized.memoryCount++;
        continue;
      }

      for (const filePath of files) {
        const parts = filePath.split('/').filter(Boolean);
        let current = root;

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const fullPath = parts.slice(0, i + 1).join('/');
          let child = current.children.find((c) => c.name === part);
          if (!child) {
            child = { name: part, path: fullPath, memoryCount: 0, children: [], memoryIds: [] };
            current.children.push(child);
          }
          current = child;
        }

        // Attach memory to the leaf node
        if (!current.memoryIds.includes(memId)) {
          current.memoryIds.push(memId);
          current.memoryCount++;
        }
      }
    }

    // Propagate memory counts upward
    this.propagateTreeCounts(root);

    // Sort children alphabetically, Uncategorized last
    this.sortTree(root);

    return { tree: root.children };
  }

  /**
   * Knowledge gap detection — cross-reference hot files with memory coverage.
   */
  @Get('gaps')
  async getKnowledgeGaps(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<{ gaps: GapEntry[] }> {
    // Fetch hot files from telemetry
    let hotFiles: Array<{ filePath: string; changeCount: number }> = [];
    try {
      hotFiles = await this.telemetryService.getHotFiles(
        user.organizationId,
        startDate,
        endDate,
      );
    } catch {
      // Telemetry may not be available
      return { gaps: [] };
    }

    // Fetch org + personal memories in parallel (cached)
    const [orgResult, personalResult] = await Promise.all([
      this.getMemoriesFast(user.organizationId, user),
      this.getMemoriesFast(user.userId, user),
    ]);
    const orgMemories = await this.filterOrgDrafts(orgResult, user);
    const personalMemories = personalResult;

    // Build a set of all folder paths covered by memories
    const coveredFolders = new Set<string>();
    for (const mem of [...orgMemories, ...personalMemories]) {
      const metadata = mem.metadata as Record<string, unknown> | null;
      const rawFiles = metadata?.files;
      const files: string[] = Array.isArray(rawFiles) ? rawFiles : typeof rawFiles === 'string' ? [rawFiles] : [];
      for (const f of files) {
        // Add file and all parent folders
        const parts = f.split('/');
        for (let i = 1; i <= parts.length; i++) {
          coveredFolders.add(parts.slice(0, i).join('/'));
        }
      }
    }

    // Aggregate hot files to folder level (2 segments deep, e.g. "apps/backend")
    const folderChanges = new Map<string, number>();
    for (const hf of hotFiles) {
      const parts = hf.filePath.split('/');
      // Use first 2 segments as the folder key (e.g., "apps/backend" from "apps/backend/src/foo.ts")
      const folder = parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0];
      folderChanges.set(folder, (folderChanges.get(folder) ?? 0) + hf.changeCount);
    }

    // Compute gaps at folder level
    const gaps: GapEntry[] = Array.from(folderChanges.entries()).map(([folder, changeCount]) => {
      // Check if any memory covers files in this folder
      const memoryCount = [...coveredFolders].filter(
        (cf) => cf === folder || cf.startsWith(folder + '/'),
      ).length;
      const gapScore = changeCount * (memoryCount === 0 ? 1 : 1 / (memoryCount + 1));
      return { filePath: folder, changeCount, memoryCount, gapScore };
    })
      .filter((g) => g.memoryCount === 0 || g.gapScore > 1)
      .sort((a, b) => b.gapScore - a.gapScore)
      .slice(0, 10);

    return { gaps };
  }

  /**
   * Memory usage insights — top-used and least-used memories.
   */
  @Get('usage-insights')
  async getUsageInsights(
    @CurrentUser() user: RequestUser,
    @Query('scope') scope: string = 'all',
    @Query('days') daysStr: string = '30',
  ): Promise<{ topUsed: Array<{ memoryId: string; content: string; accessCount: number; lastAccessed?: string }>; leastUsed: Array<{ memoryId: string; content: string; accessCount: number; lastAccessed?: string }>; neverAccessedCount: number; neverAccessed: Array<{ memoryId: string; content: string; accessCount: number }> }> {
    const days = parseInt(daysStr, 10) || 30;

    // Run ClickHouse query and memory fetches in parallel
    const allMemoryIds = new Set<string>();
    const memoryContentMap = new Map<string, string>();
    const memoryCreatedMap = new Map<string, string>();

    const populateFromMemories = (memories: Record<string, unknown>[]) => {
      for (const mem of memories) {
        const id = mem.id as string;
        allMemoryIds.add(id);
        memoryContentMap.set(id, (mem.memory as string) ?? (mem.content as string) ?? '');
        const createdAt = (mem.created_at as string) ?? (mem.createdAt as string) ?? '';
        if (createdAt) memoryCreatedMap.set(id, createdAt);
      }
    };

    const [usage] = await Promise.all([
      this.telemetryService.getUsageInsights(user.organizationId, days),
      (scope === 'all' || scope === 'personal')
        ? this.getMemoriesFast(user.userId, user).then(populateFromMemories)
        : Promise.resolve(),
      (scope === 'all' || scope === 'org')
        ? this.getMemoriesFast(user.organizationId, user)
            .then((mems) => this.filterOrgDrafts(mems, user))
            .then(populateFromMemories)
        : Promise.resolve(),
    ]);

    // Resolve content for usage entries
    const topUsed = usage.topUsed.map((u) => ({
      memoryId: u.memoryId,
      content: memoryContentMap.get(u.memoryId) ?? '',
      accessCount: u.accessCount,
      lastAccessed: u.lastAccessed,
    })).filter((u) => u.content); // Only include memories that still exist

    const leastUsed = usage.leastUsed.map((u) => ({
      memoryId: u.memoryId,
      content: memoryContentMap.get(u.memoryId) ?? '',
      accessCount: u.accessCount,
      lastAccessed: u.lastAccessed,
    })).filter((u) => u.content);

    // Find never-accessed memories: all memory IDs minus those in the usage log
    // Exclude memories created in the last 7 days — they haven't had time to be accessed
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const trackedIds = new Set([
      ...usage.topUsed.map((u) => u.memoryId),
      ...usage.leastUsed.map((u) => u.memoryId),
    ]);
    const neverAccessed = [...allMemoryIds]
      .filter((id) => {
        if (trackedIds.has(id)) return false;
        const createdAt = memoryCreatedMap.get(id);
        if (createdAt) {
          const created = new Date(createdAt);
          if (created > sevenDaysAgo) return false;
        }
        return true;
      })
      .map((id) => ({
        memoryId: id,
        content: memoryContentMap.get(id) ?? '',
        accessCount: 0,
      }))
      .filter((u) => u.content)
      .slice(0, 20);

    return { topUsed, leastUsed, neverAccessedCount: neverAccessed.length, neverAccessed };
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

  /**
   * Propagate memory counts from leaves to parent nodes.
   */
  private propagateTreeCounts(node: FileTreeNode): number {
    if (node.children.length === 0) return node.memoryCount;
    let total = node.memoryIds.length;
    for (const child of node.children) {
      total += this.propagateTreeCounts(child);
    }
    node.memoryCount = total;
    return total;
  }

  /**
   * Sort tree children alphabetically, directories first, Uncategorized last.
   */
  private sortTree(node: FileTreeNode): void {
    node.children.sort((a, b) => {
      if (a.name === 'Uncategorized') return 1;
      if (b.name === 'Uncategorized') return -1;
      const aIsDir = a.children.length > 0 ? 0 : 1;
      const bIsDir = b.children.length > 0 ? 0 : 1;
      if (aIsDir !== bIsDir) return aIsDir - bIsDir;
      return a.name.localeCompare(b.name);
    });
    for (const child of node.children) this.sortTree(child);
  }

  /**
   * Generate a compressed memory index for a repo.
   * Returns a compact markdown summary grouped by folder with category breakdowns.
   * Supports ETag caching — returns 304 if unchanged.
   */
  @Get('index')
  async getMemoryIndex(
    @CurrentUser() user: RequestUser,
    @Query('repo') repo: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Fetch all memories (personal + org) via REST API
    const [personalMemories, orgRaw] = await Promise.all([
      this.getMemoriesFast(user.userId, user),
      this.getMemoriesFast(user.organizationId, user),
    ]);
    const orgMemories = await this.filterOrgDrafts(orgRaw, user);

    const allMemories = [...personalMemories, ...orgMemories];

    // Filter by repo if specified (extract basename for exact match to avoid
    // e.g. "tandemu" matching "tandemu-website")
    const repoBasename = repo ? repo.split('/').pop()! : '';
    const filtered = repo
      ? allMemories.filter((m) => {
          const metadata = m.metadata as Record<string, unknown> | null;
          const memRepo = metadata?.repo as string | undefined;
          if (!memRepo) return false;
          const memBasename = memRepo.split('/').pop()!;
          return memBasename === repoBasename;
        })
      : allMemories;

    // Group by folder (2-level deep) with category breakdown
    const folders = new Map<string, { categories: Map<string, string[]>; count: number; recent: string[] }>();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    for (const mem of filtered) {
      const metadata = mem.metadata as Record<string, unknown> | null;
      const rawFiles = metadata?.files;
      const files: string[] = Array.isArray(rawFiles) ? rawFiles : typeof rawFiles === 'string' ? [rawFiles] : [];
      const category = (metadata?.category as string) ?? 'uncategorized';
      const content = (mem.memory as string) ?? (mem.content as string) ?? '';
      const createdAt = (mem.created_at as string) ?? (mem.createdAt as string) ?? '';
      const snippet = content;

      // Derive folder from first file path (2 directory segments deep)
      let folder = 'general';
      if (files.length > 0) {
        const parts = files[0]!.split('/').filter((p) => p && !p.includes('.'));
        folder = parts.length >= 2 ? parts.slice(0, 2).join('/') : parts.length === 1 ? parts[0]! : 'general';
      }

      if (!folders.has(folder)) {
        folders.set(folder, { categories: new Map(), count: 0, recent: [] });
      }
      const entry = folders.get(folder)!;
      entry.count++;

      if (!entry.categories.has(category)) {
        entry.categories.set(category, []);
      }
      entry.categories.get(category)!.push(snippet);

      if (createdAt > sevenDaysAgo) {
        entry.recent.push(snippet);
      }
    }

    // Build markdown index
    const lines: string[] = [
      `# Memory Index`,
      `> ${filtered.length} memories for ${repo || 'all repos'}. Use \`search_memories\` to get full content.`,
      '',
    ];

    // Sort folders by memory count (most first)
    const sortedFolders = [...folders.entries()].sort((a, b) => b[1].count - a[1].count);

    for (const [folder, data] of sortedFolders) {
      lines.push(`## ${folder} (${data.count})`);
      for (const [category, snippets] of data.categories) {
        for (const s of snippets) {
          lines.push(`- **${category}**: ${s}`);
        }
      }
      if (data.recent.length > 0 && data.recent.length < data.count) {
        lines.push(`- _${data.recent.length} new this week_`);
      }
      lines.push('');
    }

    if (folders.size === 0) {
      lines.push('_No memories yet for this repo. Memories are created during /finish and work sessions._');
    }

    const markdown = lines.join('\n');

    // ETag for caching
    const etag = createHash('md5').update(markdown).digest('hex');
    const clientEtag = req.headers['if-none-match'];

    if (clientEtag === etag) {
      res.status(304).end();
      return;
    }

    res.setHeader('ETag', etag);
    res.setHeader('Content-Type', 'text/markdown');
    res.status(200).send(markdown);
  }

}
