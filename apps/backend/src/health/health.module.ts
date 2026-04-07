import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [HealthController],
})
export class HealthModule {}
