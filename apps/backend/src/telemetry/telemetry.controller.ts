import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TelemetryService, TimesheetEntry, ToolUsageStat } from './telemetry.service.js';
import type { FinishTaskInput, FinishTaskResult } from './telemetry.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { OrgRequiredGuard } from '../auth/org-required.guard.js';
import { CurrentUser } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';
import type { AIvsManualRatio, FrictionEvent, DeveloperStat, TaskVelocityEntry, InsightsMetrics, OrgSettings } from '@tandemu/types';
import { DatabaseService } from '../database/database.service.js';

@Controller('telemetry')
@UseGuards(JwtAuthGuard, OrgRequiredGuard)
export class TelemetryController {
  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly db: DatabaseService,
  ) {}

  @Get('health')
  async healthCheck() {
    return this.telemetryService.healthCheck();
  }

  @Get('ai-ratio')
  async getAIRatio(
    @CurrentUser() user: RequestUser,
    @Query('sprintId') sprintId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('teamId') teamId?: string,
  ): Promise<AIvsManualRatio[]> {
    return this.telemetryService.getAIvsManualRatio(user.organizationId, sprintId, startDate, endDate, teamId);
  }

  @Get('friction-heatmap')
  async getFrictionHeatmap(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('teamId') teamId?: string,
  ): Promise<FrictionEvent[]> {
    const [custom, native, knownRepos] = await Promise.all([
      this.telemetryService.getFrictionHeatmap(user.organizationId, startDate, endDate, teamId),
      this.telemetryService.getNativeFriction(user.organizationId, startDate, endDate, teamId),
      this.telemetryService.getKnownRepos(user.organizationId),
    ]);

    // Extract directory names from owner/repo slugs and map back to full slug
    // e.g. "sebastiangrebe/tandemu" → match on "/tandemu/" in the path
    const repoMap = new Map<string, string>(); // dirName → full slug
    for (const slug of knownRepos) {
      const dirName = slug.includes('/') ? slug.split('/').pop()! : slug;
      repoMap.set(dirName, slug);
    }
    // Sort longest-first so "tandemu-website" matches before "tandemu"
    const dirNames = [...repoMap.keys()].sort((a, b) => b.length - a.length);

    return [...custom, ...native].map((event) => {
      for (const dirName of dirNames) {
        const idx = event.repositoryPath.indexOf(`/${dirName}/`);
        if (idx !== -1) {
          return { ...event, repo: repoMap.get(dirName)!, repositoryPath: event.repositoryPath.slice(idx + dirName.length + 2) };
        }
      }
      return event;
    });
  }

  @Get('hot-files')
  async getHotFiles(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.telemetryService.getHotFiles(user.organizationId, startDate, endDate, teamId);
  }

  @Get('investment-allocation')
  async getInvestmentAllocation(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.telemetryService.getInvestmentAllocation(user.organizationId, startDate, endDate, teamId);
  }

  @Get('ai-effectiveness')
  async getAIEffectiveness(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.telemetryService.getAIEffectiveness(user.organizationId, startDate, endDate, teamId);
  }

  @Get('cost-metrics')
  async getCostMetrics(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.telemetryService.getCostMetrics(user.organizationId, startDate, endDate, teamId);
  }

  @Get('token-usage')
  async getTokenUsage(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.telemetryService.getTokenUsage(user.organizationId, startDate, endDate, teamId);
  }

  /** Claude Code-specific — will need normalization for Codex/Cursor */
  @Get('tool-usage')
  async getToolUsage(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('teamId') teamId?: string,
  ): Promise<ToolUsageStat[]> {
    return this.telemetryService.getToolUsageStats(user.organizationId, startDate, endDate, teamId);
  }

  @Get('developer-stats')
  async getDeveloperStats(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('teamId') teamId?: string,
  ): Promise<DeveloperStat[]> {
    const stats = await this.telemetryService.getDeveloperStats(user.organizationId, startDate, endDate, teamId);

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
    @Query('teamId') teamId?: string,
  ): Promise<TaskVelocityEntry[]> {
    return this.telemetryService.getTaskVelocity(user.organizationId, startDate, endDate, teamId);
  }

  @Get('timesheets')
  async getTimesheets(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('userId') userId?: string,
    @Query('teamId') teamId?: string,
  ): Promise<TimesheetEntry[]> {
    const entries = await this.telemetryService.getTimesheets({
      organizationId: user.organizationId,
      startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: endDate || new Date().toISOString(),
      userId,
      teamId,
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

  @Get('insights')
  async getInsightsMetrics(
    @CurrentUser() user: RequestUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('teamId') teamId?: string,
  ): Promise<InsightsMetrics> {
    // Fetch org settings for ROI assumptions
    const orgResult = await this.db.query<{ settings: OrgSettings }>(
      `SELECT settings FROM organizations WHERE id = $1`,
      [user.organizationId],
    );
    const settings = orgResult.rows[0]?.settings;

    // Fetch org memory count (org memories use user_id = organizationId)
    let orgMemoriesShared = 0;
    try {
      const countResult = await this.db.query<{ count: string }>(
        `SELECT 0 AS count`, // Placeholder — org memory count comes from Mem0 via /memory/stats
        [],
      );
      // We'll enrich from the memory stats endpoint client-side instead
      orgMemoriesShared = 0;
    } catch {
      // Non-critical
    }

    const metrics = await this.telemetryService.getInsightsMetrics(
      user.organizationId, startDate, endDate, settings, teamId,
    );

    return { ...metrics, orgMemoriesShared };
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
