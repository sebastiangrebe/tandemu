import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TelemetryService, TimesheetEntry, ToolUsageStat } from './telemetry.service.js';
import type { FinishTaskInput, FinishTaskResult } from './telemetry.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { OrgRequiredGuard } from '../auth/org-required.guard.js';
import { CurrentUser } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';
import type { AIvsManualRatio, FrictionEvent, DeveloperStat, TaskVelocityEntry } from '@tandemu/types';
import { DatabaseService } from '../database/database.service.js';

@Controller('telemetry')
@UseGuards(JwtAuthGuard, OrgRequiredGuard)
export class TelemetryController {
  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly db: DatabaseService,
  ) {}

  @Get('ai-ratio')
  async getAIRatio(
    @CurrentUser() user: RequestUser,
    @Query('sprintId') sprintId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<AIvsManualRatio[]> {
    return this.telemetryService.getAIvsManualRatio(user.organizationId, sprintId, startDate, endDate);
  }

  @Get('friction-heatmap')
  async getFrictionHeatmap(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<FrictionEvent[]> {
    const [custom, native] = await Promise.all([
      this.telemetryService.getFrictionHeatmap(user.organizationId, startDate, endDate),
      this.telemetryService.getNativeFriction(user.organizationId),
    ]);
    return [...custom, ...native];
  }

  @Get('hot-files')
  async getHotFiles(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.telemetryService.getHotFiles(user.organizationId, startDate, endDate);
  }

  @Get('investment-allocation')
  async getInvestmentAllocation(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.telemetryService.getInvestmentAllocation(user.organizationId, startDate, endDate);
  }

  @Get('ai-effectiveness')
  async getAIEffectiveness(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.telemetryService.getAIEffectiveness(user.organizationId, startDate, endDate);
  }

  @Get('cost-metrics')
  async getCostMetrics(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.telemetryService.getCostMetrics(user.organizationId, startDate, endDate);
  }

  @Get('token-usage')
  async getTokenUsage(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.telemetryService.getTokenUsage(user.organizationId, startDate, endDate);
  }

  /** Claude Code-specific — will need normalization for Codex/Cursor */
  @Get('tool-usage')
  async getToolUsage(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<ToolUsageStat[]> {
    return this.telemetryService.getToolUsageStats(user.organizationId, startDate, endDate);
  }

  @Get('developer-stats')
  async getDeveloperStats(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<DeveloperStat[]> {
    const stats = await this.telemetryService.getDeveloperStats(user.organizationId, startDate, endDate);

    const userIds = [...new Set(stats.map((s) => s.userId))];
    if (userIds.length > 0) {
      const result = await this.db.query<{ id: string; name: string }>(
        `SELECT id, name FROM users WHERE id = ANY($1)`,
        [userIds],
      );
      const nameMap = new Map(result.rows.map((r) => [r.id, r.name]));
      return stats.map((s) => ({
        ...s,
        userName: nameMap.get(s.userId) ?? s.userId.slice(0, 8),
      }));
    }

    return stats;
  }

  @Get('task-velocity')
  async getTaskVelocity(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<TaskVelocityEntry[]> {
    return this.telemetryService.getTaskVelocity(user.organizationId, startDate, endDate);
  }

  @Get('timesheets')
  async getTimesheets(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('userId') userId?: string,
  ): Promise<TimesheetEntry[]> {
    const entries = await this.telemetryService.getTimesheets({
      organizationId: user.organizationId,
      startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: endDate || new Date().toISOString(),
      userId,
    });

    const userIds = [...new Set(entries.map((e) => e.userId))];
    if (userIds.length > 0) {
      const result = await this.db.query<{ id: string; name: string }>(
        `SELECT id, name FROM users WHERE id = ANY($1)`,
        [userIds],
      );
      const nameMap = new Map(result.rows.map((r) => [r.id, r.name]));
      return entries.map((e) => ({
        ...e,
        userName: nameMap.get(e.userId) ?? e.userId.slice(0, 8),
      }));
    }

    return entries;
  }

  /**
   * Process task completion — accepts raw git data, calculates AI attribution,
   * sends OTLP telemetry, returns summary.
   */
  @Post('tasks/:taskId/finish')
  @HttpCode(HttpStatus.OK)
  async finishTask(
    @CurrentUser() user: RequestUser,
    @Param('taskId') taskId: string,
    @Body() body: FinishTaskInput,
  ): Promise<FinishTaskResult> {
    return this.telemetryService.finishTask(
      user.organizationId,
      user.userId,
      taskId,
      body,
    );
  }
}
