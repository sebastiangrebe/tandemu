import { createClient, type ClickHouseClient, type ClickHouseClientConfigOptions } from "@clickhouse/client";
import type {
  AIvsManualRatio,
  FrictionEvent,
} from "@tandemu/types";

export interface ClickHouseConfig {
  url?: string;
  username?: string;
  password?: string;
  database?: string;
}

let clientInstance: ClickHouseClient | null = null;

export function createClickHouseClient(config: ClickHouseConfig): ClickHouseClient {
  const client = createClient({
    url: config.url ?? process.env["CLICKHOUSE_URL"] ?? "http://localhost:8123",
    username: config.username ?? process.env["CLICKHOUSE_USER"] ?? "default",
    password: config.password ?? process.env["CLICKHOUSE_PASSWORD"] ?? "",
    database: config.database ?? process.env["CLICKHOUSE_DATABASE"] ?? "otel",
    clickhouse_settings: {
      async_insert: 1,
      wait_for_async_insert: 0,
    },
  } as ClickHouseClientConfigOptions);

  clientInstance = client;
  return client;
}

export function getClickHouseClient(): ClickHouseClient {
  if (!clientInstance) {
    throw new Error("ClickHouse client not initialized. Call createClickHouseClient() first.");
  }
  return clientInstance;
}

export async function queryAIvsManualRatio(
  tenantId: string,
  startDate: string,
  endDate: string,
): Promise<AIvsManualRatio[]> {
  const client = getClickHouseClient();

  const result = await client.query({
    query: `
      SELECT
        tenant_id,
        day,
        sumMerge(ai_generated_lines) AS ai_generated_lines,
        sumMerge(manual_lines) AS manual_lines
      FROM ai_vs_manual_daily
      WHERE tenant_id = {tenantId:String}
        AND day >= toDate({startDate:String})
        AND day <= toDate({endDate:String})
      GROUP BY tenant_id, day
      ORDER BY day
    `,
    query_params: { tenantId, startDate, endDate },
    format: "JSONEachRow",
  });

  const rows = await result.json<{
    tenant_id: string;
    day: string;
    ai_generated_lines: number;
    manual_lines: number;
  }>();

  return rows.map((row) => {
    const total = row.ai_generated_lines + row.manual_lines;
    return {
      organizationId: row.tenant_id,
      sprintId: "",
      aiGeneratedLines: row.ai_generated_lines,
      manualLines: row.manual_lines,
      ratio: total > 0 ? row.ai_generated_lines / total : 0,
      periodStart: startDate,
      periodEnd: endDate,
    };
  });
}

export async function queryFrictionHeatmap(
  tenantId: string,
  startDate: string,
  endDate: string,
): Promise<FrictionEvent[]> {
  const client = getClickHouseClient();

  const result = await client.query({
    query: `
      SELECT
        tenant_id,
        hour,
        repository_path,
        countMerge(event_count) AS event_count,
        uniqMerge(unique_sessions) AS unique_sessions
      FROM friction_events_hourly
      WHERE tenant_id = {tenantId:String}
        AND hour >= toDateTime({startDate:String})
        AND hour <= toDateTime({endDate:String})
      GROUP BY tenant_id, hour, repository_path
      ORDER BY hour
    `,
    query_params: { tenantId, startDate, endDate },
    format: "JSONEachRow",
  });

  const rows = await result.json<{
    tenant_id: string;
    hour: string;
    repository_path: string;
    event_count: number;
    unique_sessions: number;
  }>();

  return rows.map((row) => ({
    sessionId: "",
    userId: "",
    repositoryPath: row.repository_path,
    promptLoopCount: row.event_count,
    errorCount: row.event_count,
    timestamp: row.hour,
  }));
}

export async function querySessionTimesheets(
  tenantId: string,
  startDate: string,
  endDate: string,
): Promise<
  Array<{
    tenantId: string;
    userId: string;
    day: string;
    totalDurationSeconds: number;
    sessionCount: number;
  }>
> {
  const client = getClickHouseClient();

  const result = await client.query({
    query: `
      SELECT
        tenant_id,
        user_id,
        day,
        sumMerge(total_duration_ns) AS total_duration_ns,
        countMerge(session_count) AS session_count
      FROM session_duration_daily
      WHERE tenant_id = {tenantId:String}
        AND day >= toDate({startDate:String})
        AND day <= toDate({endDate:String})
      GROUP BY tenant_id, user_id, day
      ORDER BY day, user_id
    `,
    query_params: { tenantId, startDate, endDate },
    format: "JSONEachRow",
  });

  const rows = await result.json<{
    tenant_id: string;
    user_id: string;
    day: string;
    total_duration_ns: number;
    session_count: number;
  }>();

  return rows.map((row) => ({
    tenantId: row.tenant_id,
    userId: row.user_id,
    day: row.day,
    totalDurationSeconds: row.total_duration_ns / 1_000_000_000,
    sessionCount: row.session_count,
  }));
}
