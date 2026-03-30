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

@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    forwardRef(() => MemoryModule),
    forwardRef(() => IntegrationsModule),
    BullModule.registerQueue({ name: 'telemetry' }),
  ],
  controllers: [TelemetryController, OtlpProxyController],
  providers: [TelemetryService, TelemetryProcessor],
  exports: [TelemetryService],
})
export class TelemetryModule {}
