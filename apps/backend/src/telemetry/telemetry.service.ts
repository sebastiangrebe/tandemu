import { Injectable, OnModuleDestroy, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { createClient } from '@clickhouse/client';
import type { ClickHouseClient } from '@clickhouse/client';
import { randomBytes } from 'crypto';
import type { AIvsManualRatio, FrictionEvent, DeveloperStat, TaskVelocityEntry, InsightsMetrics, InsightsDaily, OrgSettings } from '@tandemu/types';
import { MemoryService } from '../memory/memory.service.js';
import { GitHubGitService } from '../integrations/providers/github-git.service.js';
import { IntegrationsService } from '../integrations/integrations.service.js';
import type { TelemetryJobData } from '../queue/queue.types.js';

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

export interface TimesheetQuery {
  readonly organizationId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly userId?: string;
  readonly teamId?: string;
}

export interface FinishTaskInput {
  readonly provider: string;
  readonly startedAt: string;
  readonly commits: Array<{
    hash: string;
    author: string;
    subject: string;
    hasCoAuthorClaude: boolean;
  }>;
  readonly files: Array<{
    path: string;
    additions: number;
    deletions: number;
  }>;
  readonly changedFilesList: string[];
  readonly category?: string;
  readonly labels?: string[];
  readonly teamId?: string;
  readonly repo?: string;
}

export interface FinishTaskResult {
  readonly aiLines: number;
  readonly manualLines: number;
  readonly totalCommits: number;
  readonly durationSeconds: number;
  readonly filesChanged: number;
}

@Injectable()
export class TelemetryService implements OnModuleDestroy {
  private readonly client: ClickHouseClient;
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => MemoryService)) private readonly memoryService: MemoryService,
    @Inject(forwardRef(() => GitHubGitService)) private readonly gitHubGitService: GitHubGitService,
    @Inject(forwardRef(() => IntegrationsService)) private readonly integrationsService: IntegrationsService,
    @InjectQueue('telemetry') private readonly telemetryQueue: Queue<TelemetryJobData>,
  ) {
    const clickhouseUrl = this.configService.get<string>('clickhouse.url', 'http://localhost:8123');
    this.client = createClient({
      url: clickhouseUrl,
      database: 'otel',
      request_timeout: 30_000,
      compression: { request: true, response: true },
      keep_alive: { enabled: true },
      clickhouse_settings: {
        // Skip empty parts when filtering by attributes
        skip_unavailable_shards: 1,
      },
    });

    // Auto-create memory_access_log table if it doesn't exist
    this.client.query({
      query: `
        CREATE TABLE IF NOT EXISTS memory_access_log (
          memory_id String,
          organization_id String,
          user_id String,
          access_type Enum8('search' = 1, 'list' = 2, 'mcp_proxy' = 3),
          timestamp DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        ORDER BY (organization_id, memory_id, timestamp)
        TTL timestamp + INTERVAL 90 DAY
      `,
    }).then((rs) => rs.text()).catch((err) => {
      this.logger.warn(`Failed to create memory_access_log table: ${err}`);
    });

    // Add skip indexes on OTEL tables for common query patterns.
    // These are idempotent (IF NOT EXISTS) and dramatically reduce scan time
    // by letting ClickHouse skip data granules that don't match our filters.
    this.ensureSkipIndexes();
  }

  /** Strip trailing 'Z' so ClickHouse DateTime64(3) typed params accept ISO dates */
  private static dt(iso: string): string {
    return iso.endsWith('Z') ? iso.slice(0, -1) : iso;
  }

  private ensureSkipIndexes(): void {
    const indexes = [
      // otel_traces: most queries filter by org + SpanName
      `ALTER TABLE otel_traces ADD INDEX IF NOT EXISTS idx_org_id ResourceAttributes['organization_id'] TYPE bloom_filter(0.01) GRANULARITY 1`,
      `ALTER TABLE otel_traces ADD INDEX IF NOT EXISTS idx_span_name SpanName TYPE set(100) GRANULARITY 1`,
      // otel_metrics_sum: ai-ratio queries filter by org + MetricName
      `ALTER TABLE otel_metrics_sum ADD INDEX IF NOT EXISTS idx_org_id ResourceAttributes['organization_id'] TYPE bloom_filter(0.01) GRANULARITY 1`,
      `ALTER TABLE otel_metrics_sum ADD INDEX IF NOT EXISTS idx_metric_name MetricName TYPE set(100) GRANULARITY 1`,
      // otel_logs: tool-usage and friction queries filter by org + event.name
      `ALTER TABLE otel_logs ADD INDEX IF NOT EXISTS idx_org_id ResourceAttributes['organization_id'] TYPE bloom_filter(0.01) GRANULARITY 1`,
      `ALTER TABLE otel_logs ADD INDEX IF NOT EXISTS idx_severity SeverityText TYPE set(20) GRANULARITY 1`,
    ];

    for (const ddl of indexes) {
      this.client.query({ query: ddl }).then((rs) => rs.text()).catch(() => {
        // Indexes may fail if tables don't exist yet (first boot before OTEL collector runs)
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }

  async healthCheck(): Promise<{ clickhouse: string; collector: string }> {
    let clickhouse = 'error';
    let collector = 'error';

    try {
      const hc = await this.client.query({ query: 'SELECT 1', format: 'JSONEachRow' });
      await hc.text();
      clickhouse = 'ok';
    } catch (err) {
      this.logger.warn('ClickHouse health check failed', err);
    }

    try {
      const otelEndpoint = this.configService.get<string>('otel.endpoint', 'http://localhost:4318');
      const res = await fetch(`${otelEndpoint}/v1/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceSpans: [] }),
      });
      if (res.ok || res.status === 400) collector = 'ok'; // 400 = valid endpoint, empty payload rejected
    } catch (err) {
      this.logger.warn('OTEL collector health check failed', err);
    }

    return { clickhouse, collector };
  }

  /**
   * Process a task completion: calculate AI attribution, send OTLP telemetry.
   * Called by POST /api/tasks/:taskId/finish
   */
  async finishTask(
    organizationId: string,
    userId: string,
    taskId: string,
    input: FinishTaskInput,
  ): Promise<FinishTaskResult> {
    const now = new Date();
    const startedAt = new Date(input.startedAt);
    const durationSeconds = Math.round((now.getTime() - startedAt.getTime()) / 1000);
    const totalAdditions = input.files.reduce((s, f) => s + f.additions, 0);

    // Step 1: Try native OTEL for accurate AI attribution
    let aiLines = 0;
    let manualLines = 0;
    let usedNativeAttribution = false;
    let nativeAiFilePaths: string[] = [];

    try {
      const nativeResult = await this.getNativeAIAttribution(
        organizationId,
        input.startedAt,
        now.toISOString(),
      );

      if (nativeResult.aiFilePaths.length > 0) {
        usedNativeAttribution = true;
        nativeAiFilePaths = nativeResult.aiFilePaths;
        const nativeAiLines = nativeResult.totalNativeAiLines;

        // Per the plan: if native AI lines >= total additions, 100% AI
        // Otherwise split proportionally
        if (nativeAiLines >= totalAdditions) {
          aiLines = totalAdditions;
          manualLines = 0;
        } else {
          aiLines = nativeAiLines;
          manualLines = totalAdditions - nativeAiLines;
        }
      }
    } catch (err) {
      this.logger.warn('Failed to query native OTEL for AI attribution, falling back to Co-Authored-By', err);
    }

    // Step 2: Fallback to Co-Authored-By commit analysis
    if (!usedNativeAttribution) {
      const aiCommitFiles = new Set<string>();
      for (const commit of input.commits) {
        if (commit.hasCoAuthorClaude) {
          // Find files changed in this commit from the input files
          // (all files are from the branch diff, not per-commit, so we attribute all)
          aiCommitFiles.add(commit.hash);
        }
      }

      if (aiCommitFiles.size > 0 && aiCommitFiles.size === input.commits.length) {
        // All commits are AI — all lines are AI
        aiLines = totalAdditions;
        manualLines = 0;
      } else if (aiCommitFiles.size > 0) {
        // Mixed — attribute proportionally by commit count
        const aiRatio = aiCommitFiles.size / input.commits.length;
        aiLines = Math.round(totalAdditions * aiRatio);
        manualLines = totalAdditions - aiLines;
      } else {
        aiLines = 0;
        manualLines = totalAdditions;
      }
    }

    // Step 3: Send OTLP telemetry
    const otelEndpoint = this.configService.get<string>('otel.endpoint', 'http://localhost:4318');
    const traceId = randomBytes(16).toString('hex');
    const spanId = randomBytes(8).toString('hex');
    const startNs = BigInt(startedAt.getTime()) * 1_000_000n;
    const endNs = BigInt(now.getTime()) * 1_000_000n;

    const changedFiles = input.changedFilesList.join(',');
    // Use files from native attribution if available, otherwise fallback to changed files
    const aiFilesList = nativeAiFilePaths.length > 0
      ? nativeAiFilePaths.join(',')
      : aiLines > 0 ? input.changedFilesList.join(',') : '';

    // Queue trace span
    this.telemetryQueue.add('otlp-trace', {
      type: 'otlp-trace',
      otelEndpoint,
      payload: {
        resourceSpans: [{
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'claude-code' } },
              { key: 'organization_id', value: { stringValue: organizationId } },
            ],
          },
          scopeSpans: [{
            scope: { name: 'tandemu' },
            spans: [{
              traceId, spanId, name: 'task_session', kind: 1,
              startTimeUnixNano: startNs.toString(),
              endTimeUnixNano: endNs.toString(),
              attributes: [
                { key: 'user_id', value: { stringValue: userId } },
                { key: 'task_id', value: { stringValue: taskId } },
                { key: 'team_id', value: { stringValue: input.teamId ?? '' } },
                { key: 'status', value: { stringValue: 'completed' } },
                { key: 'ai_lines', value: { stringValue: String(aiLines) } },
                { key: 'manual_lines', value: { stringValue: String(manualLines) } },
                { key: 'duration_seconds', value: { stringValue: String(durationSeconds) } },
                { key: 'commits', value: { stringValue: String(input.commits.length) } },
                { key: 'changed_files', value: { stringValue: changedFiles } },
                { key: 'file_count', value: { stringValue: String(input.changedFilesList.length) } },
                { key: 'ai_files', value: { stringValue: aiFilesList } },
                { key: 'task_category', value: { stringValue: input.category ?? 'other' } },
                { key: 'task_labels', value: { stringValue: (input.labels ?? []).join(',') } },
                { key: 'repo', value: { stringValue: input.repo ?? '' } },
                { key: 'deployment', value: { stringValue: 'true' } },
              ],
              status: {},
            }],
          }],
        }],
      },
    });

    // Queue metrics
    this.telemetryQueue.add('otlp-metrics', {
      type: 'otlp-metrics',
      otelEndpoint,
      payload: {
        resourceMetrics: [{
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'claude-code' } },
              { key: 'organization_id', value: { stringValue: organizationId } },
            ],
          },
          scopeMetrics: [{
            scope: { name: 'tandemu' },
            metrics: [{
              name: 'tandemu.lines_of_code',
              sum: {
                dataPoints: [
                  { startTimeUnixNano: startNs.toString(), timeUnixNano: endNs.toString(), asDouble: aiLines, attributes: [{ key: 'type', value: { stringValue: 'ai' } }, { key: 'task_id', value: { stringValue: taskId } }, { key: 'team_id', value: { stringValue: input.teamId ?? '' } }] },
                  { startTimeUnixNano: startNs.toString(), timeUnixNano: endNs.toString(), asDouble: manualLines, attributes: [{ key: 'type', value: { stringValue: 'manual' } }, { key: 'task_id', value: { stringValue: taskId } }, { key: 'team_id', value: { stringValue: input.teamId ?? '' } }] },
                ],
                aggregationTemporality: 2,
                isMonotonic: true,
              },
            }],
          }],
        }],
      },
    });

    // Queue git self-healing
    this.telemetryQueue.add('git-self-heal', {
      type: 'git-self-heal',
      organizationId,
      input,
    });

    return {
      aiLines,
      manualLines,
      totalCommits: input.commits.length,
      durationSeconds,
      filesChanged: input.changedFilesList.length,
    };
  }

  /**
   * Self-healing: auto-index merged PRs for changed files as org memories.
   * Runs as fire-and-forget after task completion.
   */
  async selfHealGitMemories(
    organizationId: string,
    input: FinishTaskInput,
  ): Promise<void> {
    // Only heal if we have changed files
    if (!input.changedFilesList?.length) return;

    // Try to get GitHub integration and mapped repos
    let token: string;
    let repoFullName: string | undefined;
    try {
      const integration = await this.integrationsService.findOne(organizationId, 'github');
      token = integration.access_token;
      // Get the first mapped repo (externalProjectId = "owner/repo" for GitHub)
      const mappings = await this.integrationsService.getMappings(integration.id);
      repoFullName = mappings[0]?.externalProjectId;
    } catch {
      // No GitHub integration — skip silently
      return;
    }

    if (!token || !repoFullName) return;

    const [owner, repo] = repoFullName.split('/');
    if (!owner || !repo) return;

    // Deduplicate file paths to folder level (2 segments: "apps/backend")
    const folders = new Set<string>();
    for (const filePath of input.changedFilesList.slice(0, 20)) {
      const parts = filePath.split('/');
      if (parts.length >= 2) {
        folders.add(parts.slice(0, 2).join('/'));
      }
    }

    // For each folder, search for PRs and create memories
    const BOT_AUTHORS = new Set(['dependabot', 'renovate', 'dependabot[bot]', 'renovate[bot]']);
    let created = 0;

    for (const folder of folders) {
      if (created >= 10) break; // Cap to avoid flooding

      try {
        const prs = await this.gitHubGitService.fetchPRsForFile(token, owner, repo, folder);

        for (const pr of prs) {
          if (created >= 10) break;
          // Skip bot PRs
          if (BOT_AUTHORS.has(pr.author.login)) continue;
          // Skip PRs with no meaningful body
          if (!pr.body || pr.body.length < 50) continue;

          // Check if memory already exists for this PR
          const existing = await this.memoryService.searchOrgMemories(
            organizationId,
            `PR #${pr.number} ${pr.title}`,
            3,
          );
          const alreadyIndexed = existing.some(
            (m) => m.metadata?.prNumber === pr.number && m.metadata?.repo === repoFullName,
          );
          if (alreadyIndexed) continue;

          // Create org memory from PR
          const bodyExcerpt = pr.body.length > 500 ? pr.body.slice(0, 500) + '...' : pr.body;
          await this.memoryService.createOrgMemory(organizationId, `PR #${pr.number}: ${pr.title} — ${bodyExcerpt}`, {
            source: 'pr',
            prNumber: pr.number,
            prUrl: pr.url,
            repo: repoFullName,
            files: [folder],
            author_name: pr.author.login,
            status: 'published',
            category: 'decision',
          });
          created++;
        }
      } catch (err) {
        this.logger.warn(`Self-heal failed for folder ${folder}: ${err}`);
      }
    }

    if (created > 0) {
      this.logger.log(`Self-healed ${created} org memories from git history`);
    }
  }

  /**
   * Query native Claude Code OTEL data for AI file attribution.
   * Claude Code-specific — will need normalization for Codex/Cursor.
   */
  private async getNativeAIAttribution(
    organizationId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ aiFilePaths: string[]; totalNativeAiLines: number }> {
    // Get files Claude touched via Edit/Write tools
    const fileResult = await this.client.query({
      query: `
        SELECT DISTINCT
          JSONExtractString(LogAttributes['tool_parameters'], 'file_path') AS file_path
        FROM otel_logs
        WHERE ResourceAttributes['organization_id'] = {organizationId: String}
          AND LogAttributes['event.name'] = 'tool_result'
          AND LogAttributes['tool_name'] IN ('Edit', 'Write', 'NotebookEdit')
          AND LogAttributes['success'] = 'true'
          AND JSONExtractString(LogAttributes['tool_parameters'], 'file_path') != ''
          AND Timestamp >= {startDate: DateTime64(3)}
          AND Timestamp <= {endDate: DateTime64(3)}
      `,
      query_params: { organizationId, startDate: TelemetryService.dt(startDate), endDate: TelemetryService.dt(endDate) },
      format: 'JSONEachRow',
    });
    const fileRows = await fileResult.json<{ file_path: string }>();
    const aiFilePaths = fileRows.map((r) => r.file_path);

    // Get total native AI lines in the window
    let totalNativeAiLines = 0;
    try {
      const lineResult = await this.client.query({
        query: `
          SELECT sum(Value) AS total
          FROM otel_metrics_sum
          WHERE ResourceAttributes['organization_id'] = {organizationId: String}
            AND MetricName = 'claude_code.lines_of_code.count'
            AND Attributes['type'] = 'added'
            AND TimeUnix >= {startDate: DateTime64(3)}
            AND TimeUnix <= {endDate: DateTime64(3)}
        `,
        query_params: { organizationId, startDate: TelemetryService.dt(startDate), endDate: TelemetryService.dt(endDate) },
        format: 'JSONEachRow',
      });
      const lineRows = await lineResult.json<{ total: number }>();
      totalNativeAiLines = Number(lineRows[0]?.total ?? 0);
    } catch {
      // Native line metric may not exist — OK, we still have file paths
    }

    return { aiFilePaths, totalNativeAiLines };
  }

  async getAIvsManualRatio(
    organizationId: string,
    sprintId?: string,
    startDate?: string,
    endDate?: string,
    teamId?: string,
  ): Promise<AIvsManualRatio[]> {
    try {
      const params: Record<string, string> = { organizationId };
      let dateFilter = '';
      if (startDate) {
        dateFilter += ` AND TimeUnix >= {startDate: DateTime64(3)}`;
        params.startDate = TelemetryService.dt(startDate);
      }
      if (endDate) {
        dateFilter += ` AND TimeUnix <= {endDate: DateTime64(3)}`;
        params.endDate = TelemetryService.dt(endDate);
      }
      const teamFilter = teamId ? ` AND Attributes['team_id'] = {teamId: String}` : '';
      if (teamId) params.teamId = teamId;

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
          ${teamFilter}
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

  async getFrictionHeatmap(organizationId: string, startDate?: string, endDate?: string, teamId?: string): Promise<FrictionEvent[]> {
    try {
      const params: Record<string, string> = { organizationId };
      let dateFilter = '';
      if (startDate) {
        dateFilter += ` AND Timestamp >= {startDate: DateTime64(3)}`;
        params.startDate = TelemetryService.dt(startDate);
      }
      if (endDate) {
        dateFilter += ` AND Timestamp <= {endDate: DateTime64(3)}`;
        params.endDate = TelemetryService.dt(endDate);
      }
      const teamFilter = teamId ? ` AND LogAttributes['team_id'] = {teamId: String}` : '';
      if (teamId) params.teamId = teamId;

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
            ${teamFilter}
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
        repo: '',
        promptLoopCount: Number(row.prompt_loop_count),
        errorCount: Number(row.error_count),
        timestamp: row.timestamp,
      }));
    } catch {
      return [];
    }
  }


  /**
   * Returns a map of relative file path → repo name, built from task_session spans.
   * Used to resolve absolute friction paths to their repo.
   */
  async getFileRepoMap(organizationId: string): Promise<Map<string, string>> {
    try {
      const resultSet = await this.client.query({
        query: `
          SELECT
            SpanAttributes['repo'] AS repo,
            SpanAttributes['changed_files'] AS changed_files
          FROM otel_traces
          WHERE ResourceAttributes['organization_id'] = {organizationId: String}
            AND SpanName = 'task_session'
            AND SpanAttributes['repo'] != ''
            AND SpanAttributes['changed_files'] != ''
        `,
        query_params: { organizationId },
        format: 'JSONEachRow',
      });
      const rows = await resultSet.json<{ repo: string; changed_files: string }>();
      const map = new Map<string, string>();
      for (const row of rows) {
        for (const file of row.changed_files.split(',')) {
          const trimmed = file.trim();
          if (trimmed) map.set(trimmed, row.repo);
        }
      }
      return map;
    } catch {
      return new Map();
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
          AND Timestamp >= {startDate: DateTime64(3)}
          AND Timestamp <= {endDate: DateTime64(3)}
      `;

      const params: Record<string, string> = {
        organizationId: query.organizationId,
        startDate: TelemetryService.dt(query.startDate),
        endDate: TelemetryService.dt(query.endDate),
      };

      if (query.userId) {
        chQuery += ` AND SpanAttributes['user_id'] = {userId: String}`;
        params['userId'] = query.userId;
      }
      if (query.teamId) {
        chQuery += ` AND SpanAttributes['team_id'] = {teamId: String}`;
        params['teamId'] = query.teamId;
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

  async getDeveloperStats(
    organizationId: string,
    startDate?: string,
    endDate?: string,
    teamId?: string,
  ): Promise<DeveloperStat[]> {
    try {
      const params: Record<string, string> = { organizationId };
      let dateFilter = '';
      if (startDate) {
        dateFilter += ` AND Timestamp >= {startDate: DateTime64(3)}`;
        params.startDate = TelemetryService.dt(startDate);
      }
      if (endDate) {
        dateFilter += ` AND Timestamp <= {endDate: DateTime64(3)}`;
        params.endDate = TelemetryService.dt(endDate);
      }
      const teamFilter = teamId ? ` AND SpanAttributes['team_id'] = {teamId: String}` : '';
      if (teamId) params.teamId = teamId;

      const resultSet = await this.client.query({
        query: `
          SELECT
            SpanAttributes['user_id'] AS userId,
            count(*) AS sessions,
            sum(toFloat64OrZero(SpanAttributes['duration_seconds'])) / 60 AS activeMinutes,
            sum(toFloat64OrZero(SpanAttributes['ai_lines'])) AS aiLines,
            sum(toFloat64OrZero(SpanAttributes['manual_lines'])) AS manualLines
          FROM otel_traces
          WHERE ResourceAttributes['organization_id'] = {organizationId: String}
            AND SpanName = 'task_session'
            ${dateFilter}
            ${teamFilter}
          GROUP BY userId
          ORDER BY sessions DESC
        `,
        query_params: params,
        format: 'JSONEachRow',
      });

      const rows = await resultSet.json<{
        userId: string;
        sessions: number;
        activeMinutes: number;
        aiLines: number;
        manualLines: number;
      }>();

      return rows.map((row) => ({
        userId: row.userId,
        userName: row.userId,
        sessions: Number(row.sessions),
        activeMinutes: Math.round(Number(row.activeMinutes)),
        aiLines: Number(row.aiLines),
        manualLines: Number(row.manualLines),
      }));
    } catch {
      return [];
    }
  }

  async getTaskVelocity(
    organizationId: string,
    startDate?: string,
    endDate?: string,
    teamId?: string,
  ): Promise<TaskVelocityEntry[]> {
    try {
      const params: Record<string, string> = { organizationId };
      let dateFilter = '';
      if (startDate) {
        dateFilter += ` AND Timestamp >= {startDate: DateTime64(3)}`;
        params.startDate = TelemetryService.dt(startDate);
      }
      if (endDate) {
        dateFilter += ` AND Timestamp <= {endDate: DateTime64(3)}`;
        params.endDate = TelemetryService.dt(endDate);
      }
      const teamFilter = teamId ? ` AND SpanAttributes['team_id'] = {teamId: String}` : '';
      if (teamId) params.teamId = teamId;

      const resultSet = await this.client.query({
        query: `
          SELECT
            toStartOfWeek(Timestamp) AS week,
            avg(toFloat64OrZero(SpanAttributes['duration_seconds']) / 3600) AS avgDurationHours,
            count(*) AS taskCount
          FROM otel_traces
          WHERE ResourceAttributes['organization_id'] = {organizationId: String}
            AND SpanName = 'task_session'
            AND SpanAttributes['status'] = 'completed'
            ${dateFilter}
            ${teamFilter}
          GROUP BY week
          ORDER BY week ASC
        `,
        query_params: params,
        format: 'JSONEachRow',
      });

      const rows = await resultSet.json<{
        week: string;
        avgDurationHours: number;
        taskCount: number;
      }>();

      return rows.map((row) => ({
        week: row.week,
        avgDurationHours: Math.round(Number(row.avgDurationHours) * 10) / 10,
        taskCount: Number(row.taskCount),
      }));
    } catch {
      return [];
    }
  }

  async getHotFiles(
    organizationId: string,
    startDate?: string,
    endDate?: string,
    teamId?: string,
  ): Promise<Array<{ filePath: string; changeCount: number; taskCount: number; developerCount: number }>> {
    try {
      const params: Record<string, string> = { organizationId };
      let dateFilter = '';
      if (startDate) { dateFilter += ` AND Timestamp >= {startDate: DateTime64(3)}`; params.startDate = TelemetryService.dt(startDate); }
      if (endDate) { dateFilter += ` AND Timestamp <= {endDate: DateTime64(3)}`; params.endDate = TelemetryService.dt(endDate); }
      const teamFilter = teamId ? ` AND SpanAttributes['team_id'] = {teamId: String}` : '';
      if (teamId) params.teamId = teamId;

      const resultSet = await this.client.query({
        query: `
          SELECT
            arrayJoin(splitByChar(',', SpanAttributes['changed_files'])) AS file_path,
            any(SpanAttributes['repo']) AS repo,
            count(*) AS change_count,
            uniq(SpanAttributes['task_id']) AS task_count,
            uniq(SpanAttributes['user_id']) AS developer_count
          FROM otel_traces
          WHERE ResourceAttributes['organization_id'] = {organizationId: String}
            AND SpanName = 'task_session'
            AND SpanAttributes['changed_files'] != ''
            ${dateFilter}
            ${teamFilter}
          GROUP BY file_path
          ORDER BY change_count DESC
          LIMIT 50
        `,
        query_params: params,
        format: 'JSONEachRow',
      });

      const rows = await resultSet.json<{ file_path: string; repo: string; change_count: number; task_count: number; developer_count: number }>();
      return rows.map((r) => ({
        filePath: r.file_path,
        repo: r.repo || '',
        changeCount: Number(r.change_count),
        taskCount: Number(r.task_count),
        developerCount: Number(r.developer_count),
      }));
    } catch {
      return [];
    }
  }

  async getInvestmentAllocation(
    organizationId: string,
    startDate?: string,
    endDate?: string,
    teamId?: string,
  ): Promise<Array<{ category: string; taskCount: number; totalHours: number }>> {
    try {
      const params: Record<string, string> = { organizationId };
      let dateFilter = '';
      if (startDate) { dateFilter += ` AND Timestamp >= {startDate: DateTime64(3)}`; params.startDate = TelemetryService.dt(startDate); }
      if (endDate) { dateFilter += ` AND Timestamp <= {endDate: DateTime64(3)}`; params.endDate = TelemetryService.dt(endDate); }
      const teamFilter = teamId ? ` AND SpanAttributes['team_id'] = {teamId: String}` : '';
      if (teamId) params.teamId = teamId;

      const resultSet = await this.client.query({
        query: `
          SELECT
            SpanAttributes['task_category'] AS category,
            count(*) AS task_count,
            sum(toFloat64OrZero(SpanAttributes['duration_seconds'])) / 3600 AS total_hours
          FROM otel_traces
          WHERE ResourceAttributes['organization_id'] = {organizationId: String}
            AND SpanName = 'task_session'
            AND SpanAttributes['task_category'] != ''
            ${dateFilter}
            ${teamFilter}
          GROUP BY category
        `,
        query_params: params,
        format: 'JSONEachRow',
      });

      const rows = await resultSet.json<{ category: string; task_count: number; total_hours: number }>();
      return rows.map((r) => ({
        category: r.category,
        taskCount: Number(r.task_count),
        totalHours: Math.round(Number(r.total_hours) * 10) / 10,
      }));
    } catch {
      return [];
    }
  }

  async getAIEffectiveness(
    organizationId: string,
    startDate?: string,
    endDate?: string,
    teamId?: string,
  ): Promise<Array<{ filePath: string; aiTouchCount: number }>> {
    try {
      const params: Record<string, string> = { organizationId };
      let dateFilter = '';
      if (startDate) { dateFilter += ` AND Timestamp >= {startDate: DateTime64(3)}`; params.startDate = TelemetryService.dt(startDate); }
      if (endDate) { dateFilter += ` AND Timestamp <= {endDate: DateTime64(3)}`; params.endDate = TelemetryService.dt(endDate); }
      const teamFilter = teamId ? ` AND SpanAttributes['team_id'] = {teamId: String}` : '';
      if (teamId) params.teamId = teamId;

      const resultSet = await this.client.query({
        query: `
          SELECT
            arrayJoin(splitByChar(',', SpanAttributes['ai_files'])) AS file_path,
            any(SpanAttributes['repo']) AS repo,
            count(*) AS ai_touch_count
          FROM otel_traces
          WHERE ResourceAttributes['organization_id'] = {organizationId: String}
            AND SpanName = 'task_session'
            AND SpanAttributes['ai_files'] != ''
            ${dateFilter}
            ${teamFilter}
          GROUP BY file_path
          ORDER BY ai_touch_count DESC
          LIMIT 50
        `,
        query_params: params,
        format: 'JSONEachRow',
      });

      const rows = await resultSet.json<{ file_path: string; repo: string; ai_touch_count: number }>();
      return rows.map((r) => ({
        filePath: r.file_path,
        repo: r.repo || '',
        aiTouchCount: Number(r.ai_touch_count),
      }));
    } catch {
      return [];
    }
  }

  async getCostMetrics(
    organizationId: string,
    startDate?: string,
    endDate?: string,
    teamId?: string,
  ): Promise<Array<{ date: string; totalCost: number }>> {
    try {
      const params: Record<string, string> = { organizationId };
      let dateFilter = '';
      if (startDate) { dateFilter += ` AND TimeUnix >= {startDate: DateTime64(3)}`; params.startDate = TelemetryService.dt(startDate); }
      if (endDate) { dateFilter += ` AND TimeUnix <= {endDate: DateTime64(3)}`; params.endDate = TelemetryService.dt(endDate); }
      const teamFilter = teamId ? ` AND Attributes['team_id'] = {teamId: String}` : '';
      if (teamId) params.teamId = teamId;

      const resultSet = await this.client.query({
        query: `
          SELECT
            toDate(TimeUnix) AS date,
            sum(Value) AS total_cost
          FROM otel_metrics_sum
          WHERE ResourceAttributes['organization_id'] = {organizationId: String}
            AND MetricName = 'claude_code.cost.usage'
            ${dateFilter}
            ${teamFilter}
          GROUP BY date
          ORDER BY date ASC
        `,
        query_params: params,
        format: 'JSONEachRow',
      });

      const rows = await resultSet.json<{ date: string; total_cost: number }>();
      return rows.map((r) => ({
        date: r.date,
        totalCost: Math.round(Number(r.total_cost) * 100) / 100,
      }));
    } catch {
      return [];
    }
  }

  async getTokenUsage(
    organizationId: string,
    startDate?: string,
    endDate?: string,
    teamId?: string,
  ): Promise<Array<{ tokenType: string; model: string; totalTokens: number }>> {
    try {
      const params: Record<string, string> = { organizationId };
      let dateFilter = '';
      if (startDate) { dateFilter += ` AND TimeUnix >= {startDate: DateTime64(3)}`; params.startDate = TelemetryService.dt(startDate); }
      if (endDate) { dateFilter += ` AND TimeUnix <= {endDate: DateTime64(3)}`; params.endDate = TelemetryService.dt(endDate); }
      const teamFilter = teamId ? ` AND Attributes['team_id'] = {teamId: String}` : '';
      if (teamId) params.teamId = teamId;

      const resultSet = await this.client.query({
        query: `
          SELECT
            Attributes['type'] AS token_type,
            Attributes['model'] AS model,
            sum(Value) AS total_tokens
          FROM otel_metrics_sum
          WHERE ResourceAttributes['organization_id'] = {organizationId: String}
            AND MetricName = 'claude_code.token.usage'
            ${dateFilter}
            ${teamFilter}
          GROUP BY token_type, model
        `,
        query_params: params,
        format: 'JSONEachRow',
      });

      const rows = await resultSet.json<{ token_type: string; model: string; total_tokens: number }>();
      return rows.map((r) => ({
        tokenType: r.token_type,
        model: r.model,
        totalTokens: Number(r.total_tokens),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Tool usage stats from Claude Code's native tool_result events.
   * Shows which tools the team uses, success rates, and avg duration.
   */
  async getToolUsageStats(organizationId: string, startDate?: string, endDate?: string, teamId?: string): Promise<ToolUsageStat[]> {
    try {
      const params: Record<string, string> = { organizationId };
      let dateFilter = '';
      if (startDate) {
        dateFilter += ` AND Timestamp >= {startDate: DateTime64(3)}`;
        params.startDate = TelemetryService.dt(startDate);
      }
      if (endDate) {
        dateFilter += ` AND Timestamp <= {endDate: DateTime64(3)}`;
        params.endDate = TelemetryService.dt(endDate);
      }
      const teamFilter = teamId ? ` AND LogAttributes['team_id'] = {teamId: String}` : '';
      if (teamId) params.teamId = teamId;

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
            ${dateFilter}
            ${teamFilter}
          GROUP BY toolName
          ORDER BY totalCalls DESC
        `,
        query_params: params,
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
   * Claude Code-specific — queries native tool_result events for friction.
   * Will need normalization layer for Codex (codex.tool.call) and Cursor (REST API).
   * Failed tool calls grouped by file path — augments custom friction logs.
   */
  async getNativeFriction(organizationId: string, startDate?: string, endDate?: string, teamId?: string): Promise<FrictionEvent[]> {
    try {
      const params: Record<string, string> = { organizationId };
      let dateFilter = '';
      if (startDate) {
        dateFilter += ` AND Timestamp >= {startDate: DateTime64(3)}`;
        params.startDate = TelemetryService.dt(startDate);
      }
      if (endDate) {
        dateFilter += ` AND Timestamp <= {endDate: DateTime64(3)}`;
        params.endDate = TelemetryService.dt(endDate);
      }
      const teamFilter = teamId ? ` AND LogAttributes['team_id'] = {teamId: String}` : '';
      if (teamId) params.teamId = teamId;

      const resultSet = await this.client.query({
        query: `
          SELECT
            LogAttributes['session.id'] AS session_id,
            LogAttributes['user.account_uuid'] AS user_id,
            coalesce(
              nullIf(JSONExtractString(LogAttributes['tool_parameters'], 'file_path'), ''),
              nullIf(JSONExtractString(LogAttributes['tool_parameters'], 'path'), ''),
              nullIf(JSONExtractString(LogAttributes['tool_input'], 'file_path'), ''),
              nullIf(JSONExtractString(LogAttributes['tool_input'], 'path'), '')
            ) AS repository_path,
            0 AS prompt_loop_count,
            count(*) AS error_count,
            max(Timestamp) AS timestamp
          FROM otel_logs
          WHERE ResourceAttributes['organization_id'] = {organizationId: String}
            AND LogAttributes['event.name'] = 'tool_result'
            AND LogAttributes['success'] = 'false'
            ${dateFilter}
            ${teamFilter}
          GROUP BY session_id, user_id, repository_path
          HAVING repository_path != '' AND error_count >= 1
          ORDER BY error_count DESC
          LIMIT 100
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
        repo: '',
        promptLoopCount: 0,
        errorCount: Number(row.error_count),
        timestamp: row.timestamp,
      }));
    } catch {
      return [];
    }
  }

  // ---- Memory Usage Tracking ----

  /**
   * Log memory access events (fire-and-forget).
   */
  /**
   * Get the set of memory IDs that have been accessed in the last N days.
   * Lightweight query — just distinct IDs, no counts or sorting.
   */
  async getAccessedMemoryIds(organizationId: string, days = 30): Promise<Set<string>> {
    try {
      const resultSet = await this.client.query({
        query: `
          SELECT DISTINCT memory_id
          FROM memory_access_log
          WHERE organization_id = {organizationId: String}
            AND timestamp >= now() - INTERVAL {days: UInt32} DAY
        `,
        query_params: { organizationId, days },
        format: 'JSONEachRow',
      });
      const rows = await resultSet.json<{ memory_id: string }>();
      return new Set(rows.map((r) => r.memory_id));
    } catch {
      return new Set();
    }
  }

  async logMemoryAccess(
    memoryIds: string[],
    organizationId: string,
    userId: string,
    accessType: 'search' | 'list' | 'mcp_proxy',
  ): Promise<void> {
    if (memoryIds.length === 0) return;
    try {
      const values = memoryIds
        .map((id) => `('${id.replace(/'/g, "''")}', '${organizationId}', '${userId}', '${accessType}', now())`)
        .join(',');
      const insertRs = await this.client.query({
        query: `INSERT INTO memory_access_log (memory_id, organization_id, user_id, access_type, timestamp) VALUES ${values}`,
      });
      await insertRs.text();
    } catch (err) {
      this.logger.warn(`Failed to log memory access: ${err}`);
    }
  }

  /**
   * Get memory usage insights: top-used and least-used memories.
   */
  async getUsageInsights(
    organizationId: string,
    days = 30,
  ): Promise<{ topUsed: Array<{ memoryId: string; accessCount: number; lastAccessed: string }>; leastUsed: Array<{ memoryId: string; accessCount: number; lastAccessed: string }>; totalTracked: number }> {
    try {
      const resultSet = await this.client.query({
        query: `
          SELECT
            memory_id,
            count(*) AS access_count,
            max(timestamp) AS last_accessed
          FROM memory_access_log
          WHERE organization_id = {organizationId: String}
            AND timestamp >= now() - INTERVAL {days: UInt32} DAY
          GROUP BY memory_id
          ORDER BY access_count DESC
        `,
        query_params: { organizationId, days },
        format: 'JSONEachRow',
      });

      const rows = await resultSet.json<{ memory_id: string; access_count: number; last_accessed: string }>();

      const topUsed = rows.slice(0, 10).map((r) => ({
        memoryId: r.memory_id,
        accessCount: Number(r.access_count),
        lastAccessed: r.last_accessed,
      }));

      const leastUsed = rows.length > 10
        ? rows.slice(-10).reverse().map((r) => ({
            memoryId: r.memory_id,
            accessCount: Number(r.access_count),
            lastAccessed: r.last_accessed,
          }))
        : [];

      return { topUsed, leastUsed, totalTracked: rows.length };
    } catch {
      return { topUsed: [], leastUsed: [], totalTracked: 0 };
    }
  }

  /**
   * Compute insights metrics: throughput, capacity freed, cost efficiency, and Tandemu impact.
   * All derived from existing ClickHouse data — no new instrumentation.
   */
  async getInsightsMetrics(
    organizationId: string,
    startDate?: string,
    endDate?: string,
    settings?: OrgSettings,
    teamId?: string,
  ): Promise<InsightsMetrics> {
    const hourlyRate = settings?.developerHourlyRate ?? 75;
    const secsPerLine = settings?.aiLineTimeEstimateSeconds ?? 120;
    const currency = settings?.currency ?? 'USD';

    const params: Record<string, string> = { organizationId };
    let dateFilter = '';
    if (startDate) { dateFilter += ` AND TimeUnix >= {startDate: DateTime64(3)}`; params.startDate = TelemetryService.dt(startDate); }
    if (endDate) { dateFilter += ` AND TimeUnix <= {endDate: DateTime64(3)}`; params.endDate = TelemetryService.dt(endDate); }
    const metricsTeamFilter = teamId ? ` AND Attributes['team_id'] = {teamId: String}` : '';
    const tracesTeamFilter = teamId ? ` AND SpanAttributes['team_id'] = {teamId: String}` : '';
    const logsTeamFilter = teamId ? ` AND LogAttributes['team_id'] = {teamId: String}` : '';
    if (teamId) params.teamId = teamId;

    // Build a previous-period date filter for friction trend comparison
    let prevDateFilter = '';
    const prevParams: Record<string, string> = { organizationId };
    if (teamId) prevParams.teamId = teamId;
    if (startDate && endDate) {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      const duration = end - start;
      const prevStart = new Date(start - duration).toISOString();
      const prevEnd = new Date(start).toISOString();
      prevDateFilter = ` AND Timestamp >= {prevStart: DateTime64(3)} AND Timestamp <= {prevEnd: DateTime64(3)}`;
      prevParams.prevStart = TelemetryService.dt(prevStart);
      prevParams.prevEnd = TelemetryService.dt(prevEnd);
    }

    try {
      // Run all queries in parallel
      const [dailyResult, taskResult, memoryHitsResult, frictionCurrentResult, frictionPrevResult] = await Promise.all([
        // Query 1: Daily cost + AI/manual lines
        this.client.query({
          query: `
            SELECT
              toDate(TimeUnix) AS date,
              sumIf(Value, MetricName = 'claude_code.cost.usage') AS ai_cost,
              sumIf(Value, MetricName = 'tandemu.lines_of_code' AND Attributes['type'] = 'ai') AS ai_lines,
              sumIf(Value, MetricName = 'tandemu.lines_of_code' AND Attributes['type'] = 'manual') AS manual_lines
            FROM otel_metrics_sum
            WHERE ResourceAttributes['organization_id'] = {organizationId: String}
              AND MetricName IN ('claude_code.cost.usage', 'tandemu.lines_of_code')
              ${dateFilter}
              ${metricsTeamFilter}
            GROUP BY date
            ORDER BY date ASC
          `,
          query_params: params,
          format: 'JSONEachRow',
        }),

        // Query 2: Completed task count
        this.client.query({
          query: `
            SELECT count(*) AS task_count
            FROM otel_traces
            WHERE ResourceAttributes['organization_id'] = {organizationId: String}
              AND SpanName = 'task_session'
              AND SpanAttributes['status'] = 'completed'
              ${dateFilter.replace(/TimeUnix/g, 'Timestamp')}
              ${tracesTeamFilter}
          `,
          query_params: params,
          format: 'JSONEachRow',
        }),

        // Query 3: Memory access count
        this.client.query({
          query: `
            SELECT count(*) AS hits
            FROM memory_access_log
            WHERE organization_id = {organizationId: String}
              ${startDate ? ` AND timestamp >= {startDate: DateTime64(3)}` : ''}
              ${endDate ? ` AND timestamp <= {endDate: DateTime64(3)}` : ''}
          `,
          query_params: params,
          format: 'JSONEachRow',
        }),

        // Query 4: Current-period friction count
        this.client.query({
          query: `
            SELECT count(*) AS friction_count
            FROM otel_logs
            WHERE ResourceAttributes['organization_id'] = {organizationId: String}
              AND (SeverityText IN ('prompt_loop', 'error')
                   OR (LogAttributes['event.name'] = 'tool_result' AND LogAttributes['success'] = 'false'))
              ${dateFilter.replace(/TimeUnix/g, 'Timestamp')}
              ${logsTeamFilter}
          `,
          query_params: params,
          format: 'JSONEachRow',
        }),

        // Query 5: Previous-period friction count (for trend)
        prevDateFilter
          ? this.client.query({
              query: `
                SELECT count(*) AS friction_count
                FROM otel_logs
                WHERE ResourceAttributes['organization_id'] = {organizationId: String}
                  AND (SeverityText IN ('prompt_loop', 'error')
                       OR (LogAttributes['event.name'] = 'tool_result' AND LogAttributes['success'] = 'false'))
                  ${prevDateFilter}
                  ${logsTeamFilter}
              `,
              query_params: prevParams,
              format: 'JSONEachRow',
            })
          : Promise.resolve(null),
      ]);

      // Parse results
      const dailyRows = await dailyResult.json<{
        date: string;
        ai_cost: number;
        ai_lines: number;
        manual_lines: number;
      }>();

      const taskRows = await taskResult.json<{ task_count: number }>();
      const totalTasks = Number(taskRows[0]?.task_count ?? 0);

      const memoryRows = await memoryHitsResult.json<{ hits: number }>();
      const memoryHits = Number(memoryRows[0]?.hits ?? 0);

      const frictionRows = await frictionCurrentResult.json<{ friction_count: number }>();
      const currentFriction = Number(frictionRows[0]?.friction_count ?? 0);

      let frictionEventsReduced: number | null = null;
      if (frictionPrevResult) {
        const prevRows = await frictionPrevResult.json<{ friction_count: number }>();
        const prevFriction = Number(prevRows[0]?.friction_count ?? 0);
        if (prevFriction > 0) {
          frictionEventsReduced = Math.round(((currentFriction - prevFriction) / prevFriction) * 100);
        }
      }

      // Aggregate totals from daily rows
      let totalAICost = 0;
      let totalAILines = 0;
      let totalManualLines = 0;
      const daily: InsightsDaily[] = dailyRows.map((r) => {
        const aiCost = Math.round(Number(r.ai_cost) * 100) / 100;
        const aiLines = Number(r.ai_lines);
        const manualLines = Number(r.manual_lines);
        totalAICost += aiCost;
        totalAILines += aiLines;
        totalManualLines += manualLines;
        return { date: r.date, aiCost, aiLines, manualLines };
      });

      totalAICost = Math.round(totalAICost * 100) / 100;

      // Derived metrics
      const productivityMultiplier = totalManualLines > 0
        ? Math.round(((totalAILines + totalManualLines) / totalManualLines) * 100) / 100
        : null;

      const capacityFreedHours = Math.round(((totalAILines * secsPerLine) / 3600) * 10) / 10;

      const costPerAILine = totalAILines > 0
        ? Math.round((totalAICost / totalAILines) * 10000) / 10000
        : null;

      const costPerTask = totalTasks > 0
        ? Math.round((totalAICost / totalTasks) * 100) / 100
        : null;

      return {
        totalAILines,
        totalManualLines,
        totalTasks,
        productivityMultiplier,
        capacityFreedHours,
        totalAICost,
        costPerAILine,
        costPerTask,
        memoryHits,
        frictionEventsReduced,
        orgMemoriesShared: 0, // Populated by controller from memory service
        daily,
        assumptions: { developerHourlyRate: hourlyRate, aiLineTimeEstimateSeconds: secsPerLine, currency },
      };
    } catch (err) {
      this.logger.warn(`Failed to get insights metrics: ${err}`);
      return {
        totalAILines: 0,
        totalManualLines: 0,
        totalTasks: 0,
        productivityMultiplier: null,
        capacityFreedHours: 0,
        totalAICost: 0,
        costPerAILine: null,
        costPerTask: null,
        memoryHits: 0,
        frictionEventsReduced: null,
        orgMemoriesShared: 0,
        daily: [],
        assumptions: { developerHourlyRate: hourlyRate, aiLineTimeEstimateSeconds: secsPerLine, currency },
      };
    }
  }
}
