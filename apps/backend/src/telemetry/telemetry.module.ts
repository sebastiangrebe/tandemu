import { Module } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller.js';
import { TelemetryService } from './telemetry.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [TelemetryController],
  providers: [TelemetryService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
