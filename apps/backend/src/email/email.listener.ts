import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import * as Sentry from '@sentry/nestjs';
import { DatabaseService } from '../database/database.service.js';
import type { EmailJobData } from '../queue/queue.types.js';
import type {
  InviteCreatedEvent,
  InviteAcceptedEvent,
  UserRegisteredEvent,
  OrgMemberAddedEvent,
  OrgMemberRemovedEvent,
  TeamMemberAddedEvent,
  IntegrationConnectedEvent,
  EmailAliasAddedEvent,
  InvoicePaidEvent,
} from './email.types.js';

@Injectable()
export class EmailListener {
  private readonly logger = new Logger(EmailListener.name);
  private readonly enabled: boolean;
  private readonly frontendUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
    @InjectQueue('email') private readonly emailQueue: Queue<EmailJobData>,
  ) {
    this.enabled = this.configService.get<boolean>('email.enabled', false);
    this.frontendUrl = this.configService.get<string>('oauth.frontendUrl', 'http://localhost:3000');
    if (this.enabled) {
      this.logger.log('Email notifications enabled');
    }
  }

  // ── Helpers ──

  private async resolveUser(userId: string): Promise<{ email: string; name: string }> {
    const result = await this.db.query<{ email: string; name: string }>(
      'SELECT email, name FROM users WHERE id = $1',
      [userId],
    );
    return result.rows[0] ?? { email: '', name: 'Unknown' };
  }

  private async resolveOrgName(orgId: string): Promise<string> {
    const result = await this.db.query<{ name: string }>(
      'SELECT name FROM organizations WHERE id = $1',
      [orgId],
    );
    return result.rows[0]?.name ?? 'Unknown Organization';
  }

  private async resolveTeamName(teamId: string): Promise<string> {
    const result = await this.db.query<{ name: string }>(
      'SELECT name FROM teams WHERE id = $1',
      [teamId],
    );
    return result.rows[0]?.name ?? 'Unknown Team';
  }

  private async resolveTeamOrgId(teamId: string): Promise<string> {
    const result = await this.db.query<{ organization_id: string }>(
      'SELECT organization_id FROM teams WHERE id = $1',
      [teamId],
    );
    return result.rows[0]?.organization_id ?? '';
  }

  private async resolveOwnerEmail(orgId: string): Promise<string | null> {
    const result = await this.db.query<{ email: string }>(
      `SELECT u.email FROM users u
       INNER JOIN memberships m ON m.user_id = u.id
       WHERE m.organization_id = $1 AND m.role = 'owner'
       LIMIT 1`,
      [orgId],
    );
    return result.rows[0]?.email ?? null;
  }

  private async resolveAdminEmails(orgId: string): Promise<string[]> {
    const result = await this.db.query<{ email: string }>(
      `SELECT u.email FROM users u
       INNER JOIN memberships m ON m.user_id = u.id
       WHERE m.organization_id = $1 AND m.role IN ('owner', 'admin')`,
      [orgId],
    );
    return result.rows.map((r) => r.email);
  }

  private enqueue(jobName: string, data: EmailJobData): void {
    this.emailQueue.add(jobName, data).catch((err) => {
      this.logger.error(`Failed to enqueue email job ${jobName}`, err);
      Sentry.captureException(err, { tags: { operation: 'email-enqueue' }, extra: { jobName } });
    });
  }

  // ── Event Handlers ──

  @OnEvent('invite.created')
  async handleInviteCreated(payload: InviteCreatedEvent): Promise<void> {
    if (!this.enabled) return;
    const [inviter, orgName] = await Promise.all([
      this.resolveUser(payload.invitedBy),
      this.resolveOrgName(payload.organizationId),
    ]);
    this.enqueue('invite-created', {
      type: 'invite-created',
      to: payload.email,
      inviterName: inviter.name,
      organizationName: orgName,
      role: payload.role,
      frontendUrl: this.frontendUrl,
      inviteId: payload.inviteId,
    });
  }

  @OnEvent('invite.accepted')
  async handleInviteAccepted(payload: InviteAcceptedEvent): Promise<void> {
    if (!this.enabled) return;
    const [inviter, acceptor, orgName] = await Promise.all([
      this.resolveUser(payload.invitedBy),
      this.resolveUser(payload.acceptedByUserId),
      this.resolveOrgName(payload.organizationId),
    ]);
    this.enqueue('invite-accepted', {
      type: 'invite-accepted',
      to: inviter.email,
      acceptedByName: acceptor.name,
      organizationName: orgName,
    });
  }

  @OnEvent('user.registered')
  async handleUserRegistered(payload: UserRegisteredEvent): Promise<void> {
    if (!this.enabled) return;
    const orgs: Array<{ name: string; role: string }> = [];
    for (const orgId of payload.autoAcceptedOrgIds) {
      const [orgName, membership] = await Promise.all([
        this.resolveOrgName(orgId),
        this.db.query<{ role: string }>(
          'SELECT role FROM memberships WHERE user_id = $1 AND organization_id = $2',
          [payload.userId, orgId],
        ),
      ]);
      orgs.push({ name: orgName, role: (membership.rows[0]?.role ?? 'member').toUpperCase() });
    }
    this.enqueue('welcome', {
      type: 'welcome',
      to: payload.email,
      userName: payload.name,
      autoAcceptedOrgs: orgs,
      frontendUrl: this.frontendUrl,
    });
  }

  @OnEvent('organization.member_added')
  async handleMemberAddedOrg(payload: OrgMemberAddedEvent): Promise<void> {
    if (!this.enabled) return;
    const [user, orgName] = await Promise.all([
      this.resolveUser(payload.userId),
      this.resolveOrgName(payload.organizationId),
    ]);
    this.enqueue('member-added-org', {
      type: 'member-added-org',
      to: user.email,
      memberName: user.name,
      organizationName: orgName,
      role: payload.role.toUpperCase(),
      frontendUrl: this.frontendUrl,
    });
  }

  @OnEvent('organization.member_removed')
  async handleMemberRemovedOrg(payload: OrgMemberRemovedEvent): Promise<void> {
    if (!this.enabled) return;
    const [user, orgName] = await Promise.all([
      this.resolveUser(payload.userId),
      this.resolveOrgName(payload.organizationId),
    ]);
    this.enqueue('member-removed-org', {
      type: 'member-removed-org',
      to: user.email,
      memberName: user.name,
      organizationName: orgName,
    });
  }

  @OnEvent('team.member_added')
  async handleMemberAddedTeam(payload: TeamMemberAddedEvent): Promise<void> {
    if (!this.enabled) return;
    const orgId = payload.organizationId || await this.resolveTeamOrgId(payload.teamId);
    const [user, teamName, orgName] = await Promise.all([
      this.resolveUser(payload.userId),
      this.resolveTeamName(payload.teamId),
      this.resolveOrgName(orgId),
    ]);
    this.enqueue('member-added-team', {
      type: 'member-added-team',
      to: user.email,
      memberName: user.name,
      teamName,
      organizationName: orgName,
    });
  }

  @OnEvent('integration.connected')
  async handleIntegrationConnected(payload: IntegrationConnectedEvent): Promise<void> {
    if (!this.enabled) return;
    const [connector, orgName, adminEmails] = await Promise.all([
      this.resolveUser(payload.connectedByUserId),
      this.resolveOrgName(payload.organizationId),
      this.resolveAdminEmails(payload.organizationId),
    ]);
    if (adminEmails.length === 0) return;
    this.enqueue('integration-connected', {
      type: 'integration-connected',
      to: adminEmails,
      provider: payload.provider,
      organizationName: orgName,
      connectedByName: connector.name,
      frontendUrl: this.frontendUrl,
    });
  }

  @OnEvent('email_alias.added')
  async handleEmailAliasAdded(payload: EmailAliasAddedEvent): Promise<void> {
    if (!this.enabled) return;
    const user = await this.resolveUser(payload.userId);
    this.enqueue('email-alias-added', {
      type: 'email-alias-added',
      to: user.email,
      userName: user.name,
      aliasEmail: payload.aliasEmail,
    });
  }

  @OnEvent('invoice.paid')
  async handleInvoicePaid(payload: InvoicePaidEvent): Promise<void> {
    if (!this.enabled) return;
    const [ownerEmail, orgName] = await Promise.all([
      this.resolveOwnerEmail(payload.organizationId),
      this.resolveOrgName(payload.organizationId),
    ]);
    if (!ownerEmail) return;

    const amount = (payload.amountPaid / 100).toFixed(2);
    const currency = payload.currency.toUpperCase();
    const start = new Date(payload.periodStart * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const end = new Date(payload.periodEnd * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    this.enqueue('invoice-paid', {
      type: 'invoice-paid',
      to: ownerEmail,
      organizationName: orgName,
      amountFormatted: `${currency} ${amount}`,
      periodLabel: `${start} – ${end}`,
      invoiceUrl: payload.invoiceUrl,
      frontendUrl: this.frontendUrl,
    });
  }
}
