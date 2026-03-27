import { Body, Controller, Headers, HttpCode, HttpStatus, Post, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service.js';

/**
 * OTLP proxy — receives telemetry from Claude Code (and other AI tools),
 * validates the per-org ingestion key, overrides organization_id for
 * defense in depth, and forwards to the internal OTEL collector.
 *
 * This replaces direct access to the OTEL collector, which is no longer
 * exposed publicly.
 */
@Controller('telemetry/ingest')
export class OtlpProxyController {
  private readonly logger = new Logger(OtlpProxyController.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  @Post('v1/traces')
  @HttpCode(HttpStatus.OK)
  async proxyTraces(
    @Headers('authorization') auth: string,
    @Body() body: unknown,
  ) {
    const org = await this.validateIngestionKey(auth);
    const enriched = this.overrideOrgId(body, org.id);
    return this.forwardToCollector('/v1/traces', enriched);
  }

  @Post('v1/metrics')
  @HttpCode(HttpStatus.OK)
  async proxyMetrics(
    @Headers('authorization') auth: string,
    @Body() body: unknown,
  ) {
    const org = await this.validateIngestionKey(auth);
    const enriched = this.overrideOrgId(body, org.id);
    return this.forwardToCollector('/v1/metrics', enriched);
  }

  @Post('v1/logs')
  @HttpCode(HttpStatus.OK)
  async proxyLogs(
    @Headers('authorization') auth: string,
    @Body() body: unknown,
  ) {
    const org = await this.validateIngestionKey(auth);
    const enriched = this.overrideOrgId(body, org.id);
    return this.forwardToCollector('/v1/logs', enriched);
  }

  private async validateIngestionKey(authHeader: string): Promise<{ id: string }> {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const key = authHeader.slice(7).trim();
    if (!key) {
      throw new UnauthorizedException('Empty ingestion key');
    }

    const result = await this.db.query<{ id: string }>(
      'SELECT id FROM organizations WHERE ingestion_key = $1',
      [key],
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedException('Invalid ingestion key');
    }

    return result.rows[0];
  }

  /**
   * Override organization_id in all resource attributes.
   * Defense in depth — don't trust the client's claim about which org they belong to.
   */
  private overrideOrgId(body: unknown, orgId: string): unknown {
    if (!body || typeof body !== 'object') return body;

    const payload = body as Record<string, unknown>;

    // Handle traces: resourceSpans[].resource.attributes
    if (Array.isArray(payload.resourceSpans)) {
      for (const rs of payload.resourceSpans as Array<Record<string, unknown>>) {
        this.setResourceAttribute(rs, 'organization_id', orgId);
      }
    }

    // Handle metrics: resourceMetrics[].resource.attributes
    if (Array.isArray(payload.resourceMetrics)) {
      for (const rm of payload.resourceMetrics as Array<Record<string, unknown>>) {
        this.setResourceAttribute(rm, 'organization_id', orgId);
      }
    }

    // Handle logs: resourceLogs[].resource.attributes
    if (Array.isArray(payload.resourceLogs)) {
      for (const rl of payload.resourceLogs as Array<Record<string, unknown>>) {
        this.setResourceAttribute(rl, 'organization_id', orgId);
      }
    }

    return payload;
  }

  private setResourceAttribute(resourceEntry: Record<string, unknown>, key: string, value: string): void {
    const resource = resourceEntry.resource as Record<string, unknown> | undefined;
    if (!resource) {
      resourceEntry.resource = { attributes: [{ key, value: { stringValue: value } }] };
      return;
    }

    const attributes = resource.attributes as Array<{ key: string; value: unknown }> | undefined;
    if (!attributes) {
      resource.attributes = [{ key, value: { stringValue: value } }];
      return;
    }

    const existing = attributes.find((a) => a.key === key);
    if (existing) {
      existing.value = { stringValue: value };
    } else {
      attributes.push({ key, value: { stringValue: value } });
    }
  }

  private async forwardToCollector(path: string, body: unknown): Promise<void> {
    const endpoint = this.configService.get<string>('otel.endpoint', 'http://localhost:4318');

    try {
      const res = await fetch(`${endpoint}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        this.logger.error(`Collector returned ${res.status} for ${path}`);
      }
    } catch (err) {
      this.logger.error(`Failed to forward to collector at ${endpoint}${path}`, err);
    }
  }
}
