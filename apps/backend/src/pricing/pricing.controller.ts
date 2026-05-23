import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { PricingService, type ModelPrice } from './pricing.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/auth.decorator.js';
import { MembershipRole } from '@tandemu/types';

/**
 * Admin endpoints for the global `model_prices` table. Owners and admins of
 * any org can read and edit — instance-level superadmin gating is a v0.8
 * concern. Per-org overrides go through `PATCH /api/organizations/:id`
 * with `settings.modelPriceOverrides`, not here.
 */
@Controller('admin/model-prices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(MembershipRole.OWNER, MembershipRole.ADMIN)
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get()
  async list(): Promise<ModelPrice[]> {
    return this.pricingService.listGlobalPrices();
  }

  @Patch(':modelName')
  async update(
    @Param('modelName') modelName: string,
    @Body() patch: Partial<{
      provider: string;
      inputPer1M: number;
      outputPer1M: number;
      cachedPer1M: number | null;
      reasoningPer1M: number | null;
      currency: string;
    }>,
  ): Promise<ModelPrice | null> {
    return this.pricingService.updateGlobalPrice(modelName, patch);
  }
}
