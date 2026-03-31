// ── Event payloads (emitted by services, consumed by listener) ──

export interface InviteCreatedEvent {
  inviteId: string;
  email: string;
  organizationId: string;
  invitedBy: string;
  role: string;
  teamId?: string;
}

export interface InviteAcceptedEvent {
  inviteId: string;
  invitedBy: string;
  acceptedByUserId: string;
  organizationId: string;
}

export interface UserRegisteredEvent {
  userId: string;
  email: string;
  name: string;
  autoAcceptedOrgIds: string[];
}

export interface OrgMemberAddedEvent {
  organizationId: string;
  userId: string;
  email: string;
  role: string;
}

export interface OrgMemberRemovedEvent {
  organizationId: string;
  userId: string;
}

export interface TeamMemberAddedEvent {
  teamId: string;
  userId: string;
  organizationId: string;
}

export interface IntegrationConnectedEvent {
  organizationId: string;
  provider: string;
  connectedByUserId: string;
}

export interface EmailAliasAddedEvent {
  userId: string;
  aliasEmail: string;
}
