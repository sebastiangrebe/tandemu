import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { PlanTierGuard } from './billing.guard.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [BillingService, PlanTierGuard],
  exports: [BillingService, PlanTierGuard],
})
export class BillingModule {}
