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

@Controller('memory')
@UseGuards(JwtAuthGuard)
export class MemoryController {
  private readonly logger = new Logger(MemoryController.name);

  constructor(private readonly memoryService: MemoryService) {}

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

    // Inject user_id into MCP tool call arguments so memories are scoped per user
    const enrichedBody = this.injectUserId(body, user.userId);

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
      // Streaming response — pipe SSE back to client
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
      // JSON response — forward directly
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
   * Inject user_id into MCP tool call arguments so memories are scoped per user.
   * MCP JSON-RPC tool calls have: { method: "tools/call", params: { name: "...", arguments: { ... } } }
   */
  private injectUserId(body: unknown, userId: string): unknown {
    if (!body || typeof body !== 'object') return body;
    const rpc = body as Record<string, unknown>;

    if (rpc.method === 'tools/call' && rpc.params && typeof rpc.params === 'object') {
      const params = rpc.params as Record<string, unknown>;
      if (params.arguments && typeof params.arguments === 'object') {
        const args = params.arguments as Record<string, unknown>;
        // Set user_id on the arguments directly
        if (!args.user_id) {
          args.user_id = userId;
        }
        // Also ensure filters include user_id for search/get operations
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

    return body;
  }
}
