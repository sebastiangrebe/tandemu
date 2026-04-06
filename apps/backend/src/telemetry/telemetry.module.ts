import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TelemetryController } from './telemetry.controller.js';
import { OtlpProxyController } from './otlp-proxy.controller.js';
import { WebhookController } from './webhook.controller.js';
import { TelemetryService } from './telemetry.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { MemoryModule } from '../memory/memory.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { TelemetryProcessor } from '../queue/telemetry.processor.js';
import { GitHubSyncProcessor } from '../queue/github-sync.processor.js';
import { GitHubSyncScheduler } from './github-sync.scheduler.js';
import { IncidentSyncProcessor } from '../queue/incident-sync.processor.js';
import { IncidentSyncScheduler } from './incident-sync.scheduler.js';
import { PagerDutyProviderService } from '../integrations/providers/pagerduty.service.js';
import { OpsgenieProviderService } from '../integrations/providers/opsgenie.service.js';

@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    forwardRef(() => MemoryModule),
    forwardRef(() => IntegrationsModule),
    BullModule.registerQueue({ name: 'telemetry' }),
    BullModule.registerQueue({ name: 'github-sync' }),
    BullModule.registerQueue({ name: 'incident-sync' }),
  ],
  controllers: [TelemetryController, OtlpProxyController, WebhookController],
  providers: [
    TelemetryService,
    TelemetryProcessor,
    GitHubSyncProcessor,
    GitHubSyncScheduler,
    IncidentSyncProcessor,
    IncidentSyncScheduler,
    PagerDutyProviderService,
    OpsgenieProviderService,
  ],
  exports: [TelemetryService, GitHubSyncScheduler, IncidentSyncScheduler],
})
export class TelemetryModule {}
