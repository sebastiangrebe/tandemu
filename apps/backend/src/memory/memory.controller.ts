import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';

@Controller('memory')
@UseGuards(JwtAuthGuard)
export class MemoryController {
  constructor(private readonly configService: ConfigService) {}

  @Get('config')
  getConfig(@CurrentUser() user: RequestUser): { type: string; url: string } {
    const mem0ApiKey = this.configService.get<string>('MEM0_API_KEY', '');

    if (mem0ApiKey) {
      // SAAS mode: Mem0 Cloud
      return {
        type: 'mem0-cloud',
        url: `https://api.mem0.ai/v1/mcp/${user.userId}`,
      };
    }

    // OSS mode: local OpenMemory
    const host = this.configService.get<string>('OPENMEMORY_HOST', 'localhost');
    const port = this.configService.get<string>('OPENMEMORY_PORT', '8765');
    return {
      type: 'sse',
      url: `http://${host}:${port}/mcp/tandemu/sse/${user.userId}`,
    };
  }
}
