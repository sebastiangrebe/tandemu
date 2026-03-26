import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';
import { MemoryService } from '../memory/memory.service.js';

@Controller('setup')
@UseGuards(JwtAuthGuard)
export class SetupController {
  constructor(
    private readonly configService: ConfigService,
    private readonly memoryService: MemoryService,
  ) {}

  @Get('config')
  getConfig(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): {
    otel: { endpoint: string };
    memory: { type: string; url: string };
    api: { url: string };
  } {
    const proto = req.headers['x-forwarded-proto'] ?? req.protocol;
    const host = req.headers['x-forwarded-host'] ?? req.get('host');
    const baseUrl = `${proto}://${host}`;

    const memory = this.memoryService.isMem0Cloud
      ? { type: 'http', url: `${baseUrl}/api/memory/mcp` }
      : { type: 'sse', url: `${baseUrl}/api/memory/sse` };

    return {
      otel: {
        endpoint: this.configService.get<string>('otel.endpoint', 'http://localhost:4318'),
      },
      memory,
      api: {
        url: `${baseUrl}/api`,
      },
    };
  }
}
