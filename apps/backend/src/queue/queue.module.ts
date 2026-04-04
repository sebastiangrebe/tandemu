import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('redis.url', 'redis://localhost:6379'),
        },
      }),
    }),
    BullModule.registerQueue(
      {
        name: 'memory-ops',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 604800 },
        },
      },
      {
        name: 'telemetry',
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'fixed', delay: 2000 },
          removeOnComplete: { age: 600 },
          removeOnFail: { age: 86400 },
        },
      },
      {
        name: 'email',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 604800 },
        },
      },
      {
        name: 'github-sync',
        defaultJobOptions: {
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        },
      },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
