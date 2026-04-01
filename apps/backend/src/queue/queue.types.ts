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

// ── email queue ──

export interface InviteCreatedEmailJob {
  readonly type: 'invite-created';
  readonly to: string;
  readonly inviterName: string;
  readonly organizationName: string;
  readonly role: string;
  readonly frontendUrl: string;
  readonly inviteId: string;
}

export interface InviteAcceptedEmailJob {
  readonly type: 'invite-accepted';
  readonly to: string;
  readonly acceptedByName: string;
  readonly organizationName: string;
}

export interface WelcomeEmailJob {
  readonly type: 'welcome';
  readonly to: string;
  readonly userName: string;
  readonly autoAcceptedOrgs: Array<{ name: string; role: string }>;
  readonly frontendUrl: string;
}

export interface MemberAddedOrgEmailJob {
  readonly type: 'member-added-org';
  readonly to: string;
  readonly memberName: string;
  readonly organizationName: string;
  readonly role: string;
  readonly frontendUrl: string;
}

export interface MemberRemovedOrgEmailJob {
  readonly type: 'member-removed-org';
  readonly to: string;
  readonly memberName: string;
  readonly organizationName: string;
}

export interface MemberAddedTeamEmailJob {
  readonly type: 'member-added-team';
  readonly to: string;
  readonly memberName: string;
  readonly teamName: string;
  readonly organizationName: string;
}

export interface IntegrationConnectedEmailJob {
  readonly type: 'integration-connected';
  readonly to: string[];
  readonly provider: string;
  readonly organizationName: string;
  readonly connectedByName: string;
  readonly frontendUrl: string;
}

export interface EmailAliasAddedEmailJob {
  readonly type: 'email-alias-added';
  readonly to: string;
  readonly userName: string;
  readonly aliasEmail: string;
}

export interface InvoicePaidEmailJob {
  readonly type: 'invoice-paid';
  readonly to: string;
  readonly organizationName: string;
  readonly amountFormatted: string;
  readonly periodLabel: string;
  readonly invoiceUrl: string;
  readonly frontendUrl: string;
}

export type EmailJobData =
  | InviteCreatedEmailJob
  | InviteAcceptedEmailJob
  | WelcomeEmailJob
  | MemberAddedOrgEmailJob
  | MemberRemovedOrgEmailJob
  | MemberAddedTeamEmailJob
  | IntegrationConnectedEmailJob
  | EmailAliasAddedEmailJob
  | InvoicePaidEmailJob;
