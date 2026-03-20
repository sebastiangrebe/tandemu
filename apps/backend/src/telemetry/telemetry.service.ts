import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@clickhouse/client';
import type { ClickHouseClient } from '@clickhouse/client';
import type { AIvsManualRatio, FrictionEvent, DORAMetrics } from '@tandem/types';

export interface TimesheetEntry {
  readonly userId: string;
  readonly date: string;
  readonly hoursWorked: number;
  readonly aiAssistedHours: number;
  readonly manualHours: number;
}

export interface TimesheetQuery {
  readonly organizationId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly userId?: string;
}

@Injectable()
export class TelemetryService implements OnModuleDestroy {
  private readonly client: ClickHouseClient;

  constructor(private readonly configService: ConfigService) {
    const clickhouseUrl = this.configService.get<string>('clickhouse.url', 'http://localhost:8123');
    this.client = createClient({
      url: clickhouseUrl,
      database: 'otel',
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  async getAIvsManualRatio(
    organizationId: string,
    sprintId?: string,
  ): Promise<AIvsManualRatio[]> {
    try {
      const query = `
        SELECT
          ResourceAttributes['organization_id'] AS organization_id,
          ResourceAttributes['sprint_id'] AS sprint_id,
          sum(if(MetricName = 'code.lines.ai_generated', Value, 0)) AS aiGeneratedLines,
          sum(if(MetricName = 'code.lines.manual', Value, 0)) AS manualLines,
          min(TimeUnix) AS periodStart,
          max(TimeUnix) AS periodEnd
        FROM otel_metrics_sum
        WHERE ResourceAttributes['organization_id'] = {organizationId: String}
        ${sprintId ? `AND ResourceAttributes['sprint_id'] = {sprintId: String}` : ''}
        GROUP BY organization_id, sprint_id
      `;

      const params: Record<string, string> = { organizationId };
      if (sprintId) params['sprintId'] = sprintId;

      const resultSet = await this.client.query({
        query,
        query_params: params,
        format: 'JSONEachRow',
      });

      const rows = await resultSet.json<{
        organization_id: string;
        sprint_id: string;
        aiGeneratedLines: number;
        manualLines: number;
        periodStart: string;
        periodEnd: string;
      }>();

      if (rows.length === 0) {
        return [];
      }

      return rows.map((row) => ({
        organizationId: row.organization_id,
        sprintId: row.sprint_id || 'current',
        aiGeneratedLines: Number(row.aiGeneratedLines),
        manualLines: Number(row.manualLines),
        ratio: Number(row.manualLines) === 0 ? 0 : Number(row.aiGeneratedLines) / Number(row.manualLines),
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
      }));
    } catch {
      // If ClickHouse is unavailable or table doesn't exist, return empty
      return [];
    }
  }

  async getFrictionHeatmap(organizationId: string): Promise<FrictionEvent[]> {
    try {
      const resultSet = await this.client.query({
        query: `
          SELECT
            LogAttributes['session_id'] AS session_id,
            LogAttributes['user_id'] AS user_id,
            LogAttributes['repository_path'] AS repository_path,
            toUInt32(LogAttributes['prompt_loop_count']) AS prompt_loop_count,
            toUInt32(LogAttributes['error_count']) AS error_count,
            Timestamp AS timestamp
          FROM otel_logs
          WHERE ResourceAttributes['organization_id'] = {organizationId: String}
            AND (SeverityText = 'prompt_loop' OR SeverityText = 'error')
          ORDER BY Timestamp DESC
          LIMIT 1000
        `,
        query_params: { organizationId },
        format: 'JSONEachRow',
      });

      const rows = await resultSet.json<{
        session_id: string;
        user_id: string;
        repository_path: string;
        prompt_loop_count: number;
        error_count: number;
        timestamp: string;
      }>();

      return rows.map((row) => ({
        sessionId: row.session_id,
        userId: row.user_id,
        repositoryPath: row.repository_path,
        promptLoopCount: Number(row.prompt_loop_count),
        errorCount: Number(row.error_count),
        timestamp: row.timestamp,
      }));
    } catch {
      return [];
    }
  }

  async getDORAMetrics(
    organizationId: string,
    periodStart?: string,
    periodEnd?: string,
  ): Promise<DORAMetrics> {
    const defaultStart = periodStart ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const defaultEnd = periodEnd ?? new Date().toISOString();

    try {
      const resultSet = await this.client.query({
        query: `
          SELECT
            countIf(SpanAttributes['deployment'] = 'true') AS deployments,
            avgIf(Duration, SpanAttributes['type'] = 'lead_time') AS avgLeadTime,
            countIf(SpanAttributes['failure'] = 'true') / greatest(countIf(SpanAttributes['deployment'] = 'true'), 1) AS changeFailureRate,
            avgIf(Duration, SpanAttributes['type'] = 'restore') AS avgRestoreTime
          FROM otel_traces
          WHERE ResourceAttributes['organization_id'] = {organizationId: String}
            AND Timestamp >= parseDateTimeBestEffort({periodStart: String})
            AND Timestamp <= parseDateTimeBestEffort({periodEnd: String})
        `,
        query_params: {
          organizationId,
          periodStart: defaultStart,
          periodEnd: defaultEnd,
        },
        format: 'JSONEachRow',
      });

      const rows = await resultSet.json<{
        deployments: number;
        avgLeadTime: number;
        changeFailureRate: number;
        avgRestoreTime: number;
      }>();

      if (rows.length === 0 || !rows[0]) {
        return {
          deploymentFrequency: 0,
          leadTimeForChanges: 0,
          changeFailureRate: 0,
          timeToRestore: 0,
          periodStart: defaultStart,
          periodEnd: defaultEnd,
        };
      }

      const row = rows[0];
      return {
        deploymentFrequency: Number(row.deployments),
        leadTimeForChanges: Number(row.avgLeadTime) || 0,
        changeFailureRate: Number(row.changeFailureRate) || 0,
        timeToRestore: Number(row.avgRestoreTime) || 0,
        periodStart: defaultStart,
        periodEnd: defaultEnd,
      };
    } catch {
      return {
        deploymentFrequency: 0,
        leadTimeForChanges: 0,
        changeFailureRate: 0,
        timeToRestore: 0,
        periodStart: defaultStart,
        periodEnd: defaultEnd,
      };
    }
  }

  async getTimesheets(query: TimesheetQuery): Promise<TimesheetEntry[]> {
    try {
      let chQuery = `
        SELECT
          SpanAttributes['user_id'] AS userId,
          toDate(Timestamp) AS date,
          sum(Duration) / 3600000000000 AS hoursWorked,
          sumIf(Duration, SpanAttributes['ai_assisted'] = 'true') / 3600000000000 AS aiAssistedHours,
          sumIf(Duration, SpanAttributes['ai_assisted'] != 'true') / 3600000000000 AS manualHours
        FROM otel_traces
        WHERE ResourceAttributes['organization_id'] = {organizationId: String}
          AND Timestamp >= parseDateTimeBestEffort({startDate: String})
          AND Timestamp <= parseDateTimeBestEffort({endDate: String})
      `;

      const params: Record<string, string> = {
        organizationId: query.organizationId,
        startDate: query.startDate,
        endDate: query.endDate,
      };

      if (query.userId) {
        chQuery += ` AND SpanAttributes['user_id'] = {userId: String}`;
        params['userId'] = query.userId;
      }

      chQuery += ` GROUP BY userId, date ORDER BY date DESC`;

      const resultSet = await this.client.query({
        query: chQuery,
        query_params: params,
        format: 'JSONEachRow',
      });

      const rows = await resultSet.json<{
        userId: string;
        date: string;
        hoursWorked: number;
        aiAssistedHours: number;
        manualHours: number;
      }>();

      return rows.map((row) => ({
        userId: row.userId,
        date: row.date,
        hoursWorked: Number(row.hoursWorked),
        aiAssistedHours: Number(row.aiAssistedHours),
        manualHours: Number(row.manualHours),
      }));
    } catch {
      return [];
    }
  }
}
