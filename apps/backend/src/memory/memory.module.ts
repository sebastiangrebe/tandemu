import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MemoryController } from './memory.controller.js';
import { MemoryService } from './memory.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { TelemetryModule } from '../telemetry/telemetry.module.js';
import { MemoryOpsProcessor } from '../queue/memory-ops.processor.js';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => IntegrationsModule),
    forwardRef(() => TelemetryModule),
    BullModule.registerQueue({ name: 'memory-ops' }),
    BullModule.registerQueue({ name: 'telemetry' }),
  ],
  controllers: [MemoryController],
  providers: [MemoryService, MemoryOpsProcessor],
  exports: [MemoryService],
})
export class MemoryModule {}
