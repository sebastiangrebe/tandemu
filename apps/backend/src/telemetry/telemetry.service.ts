import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@clickhouse/client';
import type { ClickHouseClient } from '@clickhouse/client';
import type { AIvsManualRatio, FrictionEvent, DORAMetrics } from '@tandemu/types';

export interface TimesheetEntry {
  readonly userId: string;
  readonly userName: string;
  readonly date: string;
  readonly activeMinutes: number;
  readonly sessions: number;
}

export interface ToolUsageStat {
  readonly toolName: string;
  readonly totalCalls: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly avgDurationMs: number;
  readonly successRate: number;
}

export interface SessionQualityEntry {
  readonly sessionId: string;
  readonly userId: string;
  readonly date: string;
  readonly totalToolCalls: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly successRate: number;
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
    startDate?: string,
    endDate?: string,
  ): Promise<AIvsManualRatio[]> {
    try {
      const params: Record<string, string> = { organizationId };
      let dateFilter = '';
      if (startDate) {
        dateFilter += ` AND TimeUnix >= parseDateTimeBestEffort({startDate: String})`;
        params.startDate = startDate;
      }
      if (endDate) {
        dateFilter += ` AND TimeUnix <= parseDateTimeBestEffort({endDate: String})`;
        params.endDate = endDate;
      }

      const query = `
        SELECT
          ResourceAttributes['organization_id'] AS organization_id,
          '' AS sprint_id,
          sumIf(Value, Attributes['type'] = 'ai') AS aiGeneratedLines,
          sumIf(Value, Attributes['type'] = 'manual') AS manualLines,
          min(TimeUnix) AS periodStart,
          max(TimeUnix) AS periodEnd
        FROM otel_metrics_sum
        WHERE ResourceAttributes['organization_id'] = {organizationId: String}
          AND MetricName = 'tandemu.lines_of_code'
          ${dateFilter}
        GROUP BY organization_id
      `;

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
      return [];
    }
  }

  async getFrictionHeatmap(organizationId: string, startDate?: string, endDate?: string): Promise<FrictionEvent[]> {
    try {
      const params: Record<string, string> = { organizationId };
      let dateFilter = '';
      if (startDate) {
        dateFilter += ` AND Timestamp >= parseDateTimeBestEffort({startDate: String})`;
        params.startDate = startDate;
      }
      if (endDate) {
        dateFilter += ` AND Timestamp <= parseDateTimeBestEffort({endDate: String})`;
        params.endDate = endDate;
      }

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
            ${dateFilter}
          ORDER BY Timestamp DESC
          LIMIT 1000
        `,
        query_params: params,
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
      // Query task_session spans — completed tasks are "deployments" in Tandemu's model
      // Use duration_seconds attribute (set by /finish skill) instead of ClickHouse Duration
      // to avoid nanosecond timestamp precision issues
      const resultSet = await this.client.query({
        query: `
          SELECT
            countIf(SpanAttributes['status'] = 'completed') AS deployments,
            avgIf(
              toFloat64OrZero(SpanAttributes['duration_seconds']) / 3600,
              SpanAttributes['status'] = 'completed'
            ) AS avgLeadTimeHours,
            0 AS changeFailureRate,
            0 AS avgRestoreTime
          FROM otel_traces
          WHERE ResourceAttributes['organization_id'] = {organizationId: String}
            AND SpanName = 'task_session'
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
        avgLeadTimeHours: number;
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
        leadTimeForChanges: Number(row.avgLeadTimeHours) || 0,
        changeFailureRate: 0,
        timeToRestore: 0,
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
      // Query task_session spans for timesheet data
      // Use duration_seconds attribute instead of ClickHouse Duration to avoid
      // nanosecond timestamp precision issues from skill-generated OTLP payloads
      let chQuery = `
        SELECT
          SpanAttributes['user_id'] AS userId,
          toDate(Timestamp) AS date,
          sum(toFloat64OrZero(SpanAttributes['duration_seconds'])) / 60 AS activeMinutes,
          count(*) AS sessions
        FROM otel_traces
        WHERE ResourceAttributes['organization_id'] = {organizationId: String}
          AND SpanName = 'task_session'
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
        activeMinutes: number;
        sessions: number;
      }>();

      return rows.map((row) => ({
        userId: row.userId,
        userName: row.userId,
        date: row.date,
        activeMinutes: Math.round(Number(row.activeMinutes)),
        sessions: Number(row.sessions),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Tool usage stats from Claude Code's native tool_result events.
   * Shows which tools the team uses, success rates, and avg duration.
   */
  async getToolUsageStats(organizationId: string): Promise<ToolUsageStat[]> {
    try {
      const resultSet = await this.client.query({
        query: `
          SELECT
            LogAttributes['tool_name'] AS toolName,
            count(*) AS totalCalls,
            countIf(LogAttributes['success'] = 'true') AS successCount,
            countIf(LogAttributes['success'] = 'false') AS failureCount,
            avg(toFloat64OrZero(LogAttributes['duration_ms'])) AS avgDurationMs
          FROM otel_logs
          WHERE ResourceAttributes['organization_id'] = {organizationId: String}
            AND LogAttributes['event.name'] = 'tool_result'
            AND LogAttributes['tool_name'] != ''
          GROUP BY toolName
          ORDER BY totalCalls DESC
        `,
        query_params: { organizationId },
        format: 'JSONEachRow',
      });

      const rows = await resultSet.json<{
        toolName: string;
        totalCalls: number;
        successCount: number;
        failureCount: number;
        avgDurationMs: number;
      }>();

      return rows.map((row) => {
        const total = Number(row.totalCalls);
        const success = Number(row.successCount);
        return {
          toolName: row.toolName,
          totalCalls: total,
          successCount: success,
          failureCount: Number(row.failureCount),
          avgDurationMs: Math.round(Number(row.avgDurationMs)),
          successRate: total > 0 ? Math.round((success / total) * 100) : 0,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Session quality — success/failure ratio per session.
   * High failure rate sessions indicate friction.
   */
  async getSessionQuality(organizationId: string): Promise<SessionQualityEntry[]> {
    try {
      const resultSet = await this.client.query({
        query: `
          SELECT
            LogAttributes['session.id'] AS sessionId,
            any(LogAttributes['user.account_uuid']) AS userId,
            toDate(Timestamp) AS date,
            count(*) AS totalToolCalls,
            countIf(LogAttributes['success'] = 'true') AS successCount,
            countIf(LogAttributes['success'] = 'false') AS failureCount
          FROM otel_logs
          WHERE ResourceAttributes['organization_id'] = {organizationId: String}
            AND LogAttributes['event.name'] = 'tool_result'
          GROUP BY sessionId, date
          HAVING totalToolCalls > 5
          ORDER BY date DESC
          LIMIT 100
        `,
        query_params: { organizationId },
        format: 'JSONEachRow',
      });

      const rows = await resultSet.json<{
        sessionId: string;
        userId: string;
        date: string;
        totalToolCalls: number;
        successCount: number;
        failureCount: number;
      }>();

      return rows.map((row) => {
        const total = Number(row.totalToolCalls);
        const success = Number(row.successCount);
        return {
          sessionId: row.sessionId,
          userId: row.userId,
          date: row.date,
          totalToolCalls: total,
          successCount: success,
          failureCount: Number(row.failureCount),
          successRate: total > 0 ? Math.round((success / total) * 100) : 0,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Friction detection from native Claude Code tool_result events.
   * Failed tool calls grouped by file path — augments custom friction logs.
   */
  async getNativeFriction(organizationId: string): Promise<FrictionEvent[]> {
    try {
      const resultSet = await this.client.query({
        query: `
          SELECT
            LogAttributes['session.id'] AS session_id,
            LogAttributes['user.account_uuid'] AS user_id,
            JSONExtractString(LogAttributes['tool_parameters'], 'file_path') AS repository_path,
            0 AS prompt_loop_count,
            count(*) AS error_count,
            max(Timestamp) AS timestamp
          FROM otel_logs
          WHERE ResourceAttributes['organization_id'] = {organizationId: String}
            AND LogAttributes['event.name'] = 'tool_result'
            AND LogAttributes['success'] = 'false'
            AND JSONExtractString(LogAttributes['tool_parameters'], 'file_path') != ''
          GROUP BY session_id, user_id, repository_path
          HAVING error_count >= 2
          ORDER BY error_count DESC
          LIMIT 100
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
        promptLoopCount: 0,
        errorCount: Number(row.error_count),
        timestamp: row.timestamp,
      }));
    } catch {
      return [];
    }
  }
}
