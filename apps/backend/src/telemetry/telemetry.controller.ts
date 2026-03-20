import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { TelemetryService, TimesheetEntry } from './telemetry.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { OrgRequiredGuard } from '../auth/org-required.guard.js';
import { CurrentUser } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';
import type { AIvsManualRatio, FrictionEvent, DORAMetrics } from '@tandem/types';

@Controller('telemetry')
@UseGuards(JwtAuthGuard, OrgRequiredGuard)
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Get('ai-ratio')
  async getAIRatio(
    @CurrentUser() user: RequestUser,
    @Query('sprintId') sprintId?: string,
  ): Promise<AIvsManualRatio[]> {
    return this.telemetryService.getAIvsManualRatio(user.organizationId, sprintId);
  }

  @Get('friction-heatmap')
  async getFrictionHeatmap(
    @CurrentUser() user: RequestUser,
  ): Promise<FrictionEvent[]> {
    return this.telemetryService.getFrictionHeatmap(user.organizationId);
  }

  @Get('dora-metrics')
  async getDORAMetrics(
    @CurrentUser() user: RequestUser,
    @Query('periodStart') periodStart?: string,
    @Query('periodEnd') periodEnd?: string,
  ): Promise<DORAMetrics> {
    return this.telemetryService.getDORAMetrics(
      user.organizationId,
      periodStart,
      periodEnd,
    );
  }

  @Get('timesheets')
  async getTimesheets(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('userId') userId?: string,
  ): Promise<TimesheetEntry[]> {
    return this.telemetryService.getTimesheets({
      organizationId: user.organizationId,
      startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: endDate || new Date().toISOString(),
      userId,
    });
  }
}
