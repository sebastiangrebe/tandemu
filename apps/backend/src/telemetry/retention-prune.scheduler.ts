import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { TelemetryJobData } from '../queue/queue.types.js';

/**
 * Schedules the daily telemetry retention prune. The actual deletion runs in
 * TelemetryService.pruneExpiredTelemetry() via the telemetry queue processor.
 * Cadence is daily off-peak: ClickHouse `ALTER TABLE ... DELETE` is a heavy
 * async mutation, so we deliberately avoid frequent runs.
 */
@Injectable()
export class RetentionPruneScheduler implements OnModuleInit {
  private readonly logger = new Logger(RetentionPruneScheduler.name);

  constructor(
    @InjectQueue('telemetry') private readonly telemetryQueue: Queue<TelemetryJobData>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.telemetryQueue.add(
      'retention-prune-trigger',
      { type: 'retention-prune' },
      {
        repeat: { pattern: '30 3 * * *' },
        jobId: 'retention-prune-repeatable',
      },
    );
    this.logger.log('Retention prune scheduler registered (daily 03:30)');
  }
}
