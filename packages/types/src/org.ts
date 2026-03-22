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
}

export interface InviteMemberDto {
  readonly email: string;
  readonly organizationId: string;
  readonly role: MembershipRole;
}

export interface Team {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
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
