import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TelemetryController } from './telemetry.controller.js';
import { OtlpProxyController } from './otlp-proxy.controller.js';
import { TelemetryService } from './telemetry.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { MemoryModule } from '../memory/memory.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { TelemetryProcessor } from '../queue/telemetry.processor.js';
import { GitHubSyncProcessor } from '../queue/github-sync.processor.js';
import { GitHubSyncScheduler } from './github-sync.scheduler.js';

@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    forwardRef(() => MemoryModule),
    forwardRef(() => IntegrationsModule),
    BullModule.registerQueue({ name: 'telemetry' }),
    BullModule.registerQueue({ name: 'github-sync' }),
  ],
  controllers: [TelemetryController, OtlpProxyController],
  providers: [TelemetryService, TelemetryProcessor, GitHubSyncProcessor, GitHubSyncScheduler],
  exports: [TelemetryService, GitHubSyncScheduler],
})
export class TelemetryModule {}
