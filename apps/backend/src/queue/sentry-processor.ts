import { WorkerHost } from '@nestjs/bullmq';
import * as Sentry from '@sentry/nestjs';
import type { Job } from 'bullmq';

/**
 * Base class for Bull queue processors that reports errors to Sentry.
 *
 * NestJS exception filters only cover HTTP context — Bull processors
 * run outside that, so errors are invisible to Sentry by default.
 * The @sentry/nestjs BullMQ auto-instrumentation doesn't work with
 * ESM ("type": "module") because it relies on CJS require patching.
 *
 * Extend this instead of WorkerHost to get automatic Sentry capture.
 */
export abstract class SentryProcessor extends WorkerHost {
  abstract run(job: Job): Promise<void>;

  async process(job: Job): Promise<void> {
    try {
      await this.run(job);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { queue: (this.constructor as { name: string }).name, jobName: job.name },
        extra: { jobId: job.id, jobData: job.data },
      });
      throw err;
    }
  }
}
