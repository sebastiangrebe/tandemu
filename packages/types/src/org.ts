import { PlanTier, SubscriptionStatus } from "./billing.js";

export enum MembershipRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  MEMBER = "MEMBER",
}

export interface Organization {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly stripeCustomerId?: string;
  readonly stripeSubscriptionId?: string;
  readonly planTier: PlanTier;
  readonly subscriptionStatus: SubscriptionStatus;
  readonly settings?: OrgSettings;
  /** Generic resource caps. Undefined = unlimited. Set by Platform billing. */
  readonly maxSeats?: number;
  readonly maxRepos?: number;
  readonly retentionDays?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface User {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Membership {
  readonly id: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly role: MembershipRole;
  readonly createdAt: string;
}

export interface CreateOrganizationDto {
  readonly name: string;
  readonly slug: string;
  readonly planTier?: PlanTier;
}

export interface UpdateOrganizationDto {
  readonly name?: string;
  readonly slug?: string;
  readonly planTier?: PlanTier;
  readonly stripeCustomerId?: string;
  readonly stripeSubscriptionId?: string;
  readonly subscriptionStatus?: SubscriptionStatus;
  readonly settings?: Partial<OrgSettings>;
  readonly maxSeats?: number;
  readonly maxRepos?: number;
  readonly retentionDays?: number;
}

export interface InviteMemberDto {
  readonly email: string;
  readonly organizationId: string;
  readonly role: MembershipRole;
}

export interface ModelPriceOverride {
  /** USD per 1M input tokens. Overrides the global model_prices row. */
  readonly inputPer1M?: number;
  /** USD per 1M output tokens. */
  readonly outputPer1M?: number;
  /** USD per 1M cache-hit tokens. Optional — not all models have a cache discount. */
  readonly cachedPer1M?: number;
  /** USD per 1M reasoning tokens. Optional — only emitted by reasoning models. */
  readonly reasoningPer1M?: number;
}

export interface OrgSettings {
  /** Fully-loaded hourly cost of one developer in USD. Default: 75 */
  readonly developerHourlyRate?: number;
  /** Estimated seconds a developer takes to write one line manually. Default: 120 */
  readonly aiLineTimeEstimateSeconds?: number;
  /** Currency code. Default: 'USD' */
  readonly currency?: string;
  /** Days to keep draft org memories before cleanup. Default: 30 */
  readonly draftRetentionDays?: number;
  /** Optional monthly AI cost budget in the org's currency. Null = no budget. */
  readonly monthlyAICostBudget?: number;
  /**
   * Per-model price overrides for agents that emit raw token counts (e.g. Codex
   * CLI). Keyed by model name. Falls back to the global `model_prices` table
   * when not set. Each field is optional so admins can override one rate
   * (e.g. just the input rate) without re-specifying the rest.
   */
  readonly modelPriceOverrides?: Record<string, ModelPriceOverride>;
}

export interface TeamSettings {
  readonly doneWindowDays?: number; // default: 14
}

export interface Team {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly settings: TeamSettings;
  readonly organizationId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TeamMember {
  readonly id: string;
  readonly teamId: string;
  readonly userId: string;
  readonly createdAt: string;
}

export interface CreateTeamDto {
  readonly name: string;
  readonly description?: string;
}

export interface UpdateTeamDto {
  readonly name?: string;
  readonly description?: string;
  readonly settings?: Partial<TeamSettings>;
}

export interface Invite {
  readonly id: string;
  readonly email: string;
  readonly organizationId: string;
  readonly role: MembershipRole;
  readonly invitedBy: string;
  readonly status: 'pending' | 'accepted' | 'expired';
  readonly teamId?: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface CreateInviteDto {
  readonly email: string;
  readonly role: MembershipRole;
  readonly teamId?: string;
}
