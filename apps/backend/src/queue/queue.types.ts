import type { FinishTaskInput } from '../telemetry/telemetry.service.js';

// ── memory-ops queue ──

export interface PromoteMemoryJob {
  readonly type: 'promote-memory';
  readonly memoryId: string;
  readonly upstreamUrl: string;
  readonly upstreamHeaders: Record<string, string>;
}

export interface DeleteMemoryUpstreamJob {
  readonly type: 'delete-memory-upstream';
  readonly memoryId: string;
  readonly upstreamUrl: string;
  readonly upstreamHeaders: Record<string, string>;
}

export interface McpToolCallJob {
  readonly type: 'mcp-tool-call';
  readonly toolName: string;
  readonly args: Record<string, unknown>;
  readonly userId: string;
}

export interface CleanStaleDraftsJob {
  readonly type: 'clean-stale-drafts';
}

export interface CleanupUserMemoriesJob {
  readonly type: 'cleanup-user-memories';
  readonly userId: string;
  readonly organizationId: string;
}

export type MemoryOpsJobData =
  | PromoteMemoryJob
  | DeleteMemoryUpstreamJob
  | McpToolCallJob
  | CleanStaleDraftsJob
  | CleanupUserMemoriesJob;

// ── telemetry queue ──

export interface MemoryAccessLogJob {
  readonly type: 'memory-access-log';
  readonly memoryIds: string[];
  readonly organizationId: string;
  readonly userId: string;
  readonly accessType: 'search' | 'list' | 'mcp_proxy';
}

export interface OtlpTraceJob {
  readonly type: 'otlp-trace';
  readonly payload: Record<string, unknown>;
  readonly otelEndpoint: string;
}

export interface OtlpMetricsJob {
  readonly type: 'otlp-metrics';
  readonly payload: Record<string, unknown>;
  readonly otelEndpoint: string;
}

export interface GitSelfHealJob {
  readonly type: 'git-self-heal';
  readonly organizationId: string;
  readonly input: FinishTaskInput;
}

export type TelemetryJobData =
  | MemoryAccessLogJob
  | OtlpTraceJob
  | OtlpMetricsJob
  | GitSelfHealJob;
