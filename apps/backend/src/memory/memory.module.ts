import { Module, forwardRef, Logger, type OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { MemoryController } from './memory.controller.js';
import { MemoryService } from './memory.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { TelemetryModule } from '../telemetry/telemetry.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { MemoryOpsProcessor } from '../queue/memory-ops.processor.js';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => IntegrationsModule),
    forwardRef(() => TelemetryModule),
    OrganizationsModule,
    BullModule.registerQueue({ name: 'memory-ops' }),
    BullModule.registerQueue({ name: 'telemetry' }),
  ],
  controllers: [MemoryController],
  providers: [MemoryService, MemoryOpsProcessor],
  exports: [MemoryService],
})
export class MemoryModule implements OnModuleInit {
  private readonly logger = new Logger(MemoryModule.name);

  constructor(
    @InjectQueue('memory-ops') private readonly memoryOpsQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.memoryOpsQueue.upsertJobScheduler(
      'clean-stale-drafts',
      { every: 24 * 60 * 60 * 1000 },
      { name: 'clean-stale-drafts', data: { type: 'clean-stale-drafts' } },
    );
    this.logger.log('Registered daily stale draft cleanup job');
  }
}
