import { Module, forwardRef } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller.js';
import { OtlpProxyController } from './otlp-proxy.controller.js';
import { TelemetryService } from './telemetry.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { MemoryModule } from '../memory/memory.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';

@Module({
  imports: [AuthModule, DatabaseModule, forwardRef(() => MemoryModule), forwardRef(() => IntegrationsModule)],
  controllers: [TelemetryController, OtlpProxyController],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
