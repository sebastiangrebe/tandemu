import { Processor } from '@nestjs/bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import type { Job } from 'bullmq';
import { SentryProcessor } from './sentry-processor.js';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import type { TelemetryJobData } from './queue.types.js';

@Processor('telemetry')
export class TelemetryProcessor extends SentryProcessor {
  private readonly logger = new Logger(TelemetryProcessor.name);

  constructor(
    @Inject(forwardRef(() => TelemetryService))
    private readonly telemetryService: TelemetryService,
  ) {
    super();
  }

  async run(job: Job<TelemetryJobData>): Promise<void> {
    switch (job.data.type) {
      case 'memory-access-log':
        await this.telemetryService.logMemoryAccess(
          job.data.memoryIds,
          job.data.organizationId,
          job.data.userId,
          job.data.accessType,
        );
        break;
      case 'otlp-trace':
        await this.sendOtlp(job.data.otelEndpoint, '/v1/traces', job.data.payload);
        break;
      case 'otlp-metrics':
        await this.sendOtlp(job.data.otelEndpoint, '/v1/metrics', job.data.payload);
        break;
      case 'git-self-heal':
        await this.telemetryService.selfHealGitMemories(
          job.data.organizationId,
          job.data.input,
        );
        break;
    }
  }

  private async sendOtlp(
    endpoint: string,
    path: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const res = await fetch(`${endpoint}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`OTLP ${path} failed: ${res.status}`);
    }
    this.logger.debug(`OTLP ${path} sent successfully`);
  }
}
