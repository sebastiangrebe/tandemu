import { Module, forwardRef } from '@nestjs/common';
import { MemoryController } from './memory.controller.js';
import { MemoryService } from './memory.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { TelemetryModule } from '../telemetry/telemetry.module.js';

@Module({
  imports: [AuthModule, forwardRef(() => IntegrationsModule), TelemetryModule],
  controllers: [MemoryController],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
