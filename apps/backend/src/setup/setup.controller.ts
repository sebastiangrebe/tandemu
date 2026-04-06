import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';
import { MemoryService } from '../memory/memory.service.js';
import { DatabaseService } from '../database/database.service.js';

@Controller('setup')
@UseGuards(JwtAuthGuard)
export class SetupController {
  constructor(
    private readonly configService: ConfigService,
    private readonly memoryService: MemoryService,
    private readonly db: DatabaseService,
  ) {}

  @Get('config')
  async getConfig(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ): Promise<{
    otel: { endpoint: string; ingestionKey: string };
    memory: { type: string; url: string };
    api: { url: string };
  }> {
    const proto = req.headers['x-forwarded-proto'] ?? req.protocol;
    const host = req.headers['x-forwarded-host'] ?? req.get('host');
    const baseUrl = `${proto}://${host}`;

    const memory = { type: 'http', url: `${baseUrl}/api/memory/mcp` };

    // Fetch the org's ingestion key for OTEL authentication
    let ingestionKey = '';
    try {
      const result = await this.db.query<{ ingestion_key: string }>(
        'SELECT ingestion_key FROM organizations WHERE id = $1',
        [user.organizationId],
      );
      ingestionKey = result.rows[0]?.ingestion_key ?? '';
    } catch {
      // Non-critical — OTEL will work without auth in OSS/dev
    }

    return {
      otel: {
        // OTEL goes through the backend proxy, not directly to the collector
        endpoint: `${baseUrl}/api/telemetry/ingest`,
        ingestionKey,
      },
      memory,
      api: {
        url: `${baseUrl}/api`,
      },
    };
  }
}
