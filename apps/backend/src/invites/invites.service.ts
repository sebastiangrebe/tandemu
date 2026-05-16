import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../database/database.service.js';
import type { Invite, MembershipRole } from '@tandemu/types';
import type { InviteCreatedEvent, InviteAcceptedEvent } from '../email/email.types.js';

@Injectable()
export class InvitesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(orgId: string, email: string, role: MembershipRole, invitedBy: string, teamId?: string): Promise<Invite> {
    // Check if user already exists and is already a member
    const userResult = await this.db.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );

    if (userResult.rows.length > 0) {
      const userId = userResult.rows[0]!.id;
      const membership = await this.db.query(
        'SELECT id FROM memberships WHERE user_id = $1 AND organization_id = $2',
        [userId, orgId],
      );

      if (membership.rows.length > 0) {
        throw new ConflictException('User is already a member of this organization');
      }
    }

    const result = await this.db.query<{
      id: string;
      email: string;
      organization_id: string;
      role: string;
      invited_by: string;
      team_id: string | null;
      status: string;
      created_at: Date;
      expires_at: Date;
    }>(
      `INSERT INTO invites (email, organization_id, role, invited_by, team_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [email, orgId, role.toLowerCase(), invitedBy, teamId ?? null],
    );

    const invite = this.mapInvite(result.rows[0]!);
    this.eventEmitter.emit('invite.created', {
      inviteId: invite.id,
      email,
      organizationId: orgId,
      invitedBy,
      role: invite.role,
      teamId,
    } satisfies InviteCreatedEvent);
    return invite;
  }

  async findAllForOrg(orgId: string): Promise<Invite[]> {
    const result = await this.db.query<{
      id: string;
      email: string;
      organization_id: string;
      role: string;
      invited_by: string;
      team_id: string | null;
      status: string;
      created_at: Date;
      expires_at: Date;
    }>(
      `SELECT * FROM invites WHERE organization_id = $1 AND status = 'pending'`,
      [orgId],
    );

    return result.rows.map((row) => this.mapInvite(row));
  }

  async accept(inviteId: string, userId: string): Promise<Invite> {
    // Get the invite
    const inviteResult = await this.db.query<{
      id: string;
      email: string;
      organization_id: string;
      role: string;
      invited_by: string;
      team_id: string | null;
      status: string;
      created_at: Date;
      expires_at: Date;
    }>(
      `SELECT * FROM invites WHERE id = $1 AND status = 'pending'`,
      [inviteId],
    );

    if (inviteResult.rows.length === 0) {
      throw new NotFoundException(`Invite with id ${inviteId} not found or already processed`);
    }

    const invite = inviteResult.rows[0]!;

    // Verify the accepting user's email matches the invite email
    const userResult = await this.db.query<{ email: string }>(
      'SELECT email FROM users WHERE id = $1',
      [userId],
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundException('User not found');
    }

    if (userResult.rows[0]!.email !== invite.email) {
      throw new ForbiddenException('This invite is not for your email address');
    }

    // Canonical seat cap. OSS reads generic numeric caps only (no billing
    // knowledge): max_seats NULL = unlimited. The FREE recurring plan is a
    // hard 1 seat even though its max_seats stays NULL. Defense-in-depth:
    // covers acceptance, not just invite creation.
    const capResult = await this.db.query<{
      max_seats: number | null;
      plan_tier: string;
    }>(
      'SELECT max_seats, plan_tier FROM organizations WHERE id = $1',
      [invite.organization_id],
    );
    const planTier = capResult.rows[0]?.plan_tier ?? 'free';
    let maxSeats: number | null = capResult.rows[0]?.max_seats ?? null;
    if (planTier === 'free') maxSeats = 1;
    if (maxSeats !== null) {
      const seatResult = await this.db.query<{ count: string }>(
        'SELECT COUNT(*) AS count FROM memberships WHERE organization_id = $1',
        [invite.organization_id],
      );
      const currentSeats = parseInt(seatResult.rows[0]!.count, 10);
      if (currentSeats >= maxSeats) {
        throw new ForbiddenException(
          `Seat limit reached (${maxSeats}). Upgrade to the $25/seat/month plan to add more team members.`,
        );
      }
    }

    // Use a transaction to accept the invite, create membership, and assign team
    const result = await this.db.withTransaction(async (client) => {
      // Update invite status
      const updatedInvite = await client.query<{
        id: string;
        email: string;
        organization_id: string;
        role: string;
        invited_by: string;
        team_id: string | null;
        status: string;
        created_at: Date;
        expires_at: Date;
      }>(
        `UPDATE invites SET status = 'accepted' WHERE id = $1 RETURNING *`,
        [inviteId],
      );

      // Create membership
      await client.query(
        `INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, $3)`,
        [userId, invite.organization_id, invite.role],
      );

      // Auto-assign to team if specified
      if (invite.team_id) {
        await client.query(
          `INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [invite.team_id, userId],
        );
      }

      return updatedInvite.rows[0]!;
    });

    this.eventEmitter.emit('invite.accepted', {
      inviteId,
      invitedBy: invite.invited_by,
      acceptedByUserId: userId,
      organizationId: invite.organization_id,
    } satisfies InviteAcceptedEvent);
    this.eventEmitter.emit('organization.membership_changed', { organizationId: invite.organization_id });
    return this.mapInvite(result);
  }

  async getDetails(inviteId: string, userId: string): Promise<{
    id: string;
    organizationName: string;
    inviterName: string;
    role: string;
    status: string;
    expiresAt: string;
  }> {
    const result = await this.db.query<{
      id: string;
      email: string;
      role: string;
      status: string;
      expires_at: Date;
      org_name: string;
      inviter_name: string;
    }>(
      `SELECT i.id, i.email, i.role, i.status, i.expires_at,
              o.name AS org_name, u.name AS inviter_name
       FROM invites i
       JOIN organizations o ON o.id = i.organization_id
       JOIN users u ON u.id = i.invited_by
       WHERE i.id = $1`,
      [inviteId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Invite with id ${inviteId} not found`);
    }

    const row = result.rows[0]!;

    // Verify the requesting user's email matches the invite
    const userResult = await this.db.query<{ email: string }>(
      'SELECT email FROM users WHERE id = $1',
      [userId],
    );
    if (userResult.rows.length === 0 || userResult.rows[0]!.email !== row.email) {
      throw new ForbiddenException('This invite is not for your email address');
    }

    return {
      id: row.id,
      organizationName: row.org_name,
      inviterName: row.inviter_name,
      role: row.role.toUpperCase(),
      status: row.status,
      expiresAt: row.expires_at.toISOString(),
    };
  }

  async cancel(inviteId: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM invites WHERE id = $1 AND status = 'pending'`,
      [inviteId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findPendingForEmail(email: string): Promise<Invite[]> {
    const result = await this.db.query<{
      id: string;
      email: string;
      organization_id: string;
      role: string;
      invited_by: string;
      team_id: string | null;
      status: string;
      created_at: Date;
      expires_at: Date;
    }>(
      `SELECT * FROM invites WHERE email = $1 AND status = 'pending'`,
      [email],
    );

    return result.rows.map((row) => this.mapInvite(row));
  }

  private mapInvite(row: {
    id: string;
    email: string;
    organization_id: string;
    role: string;
    invited_by: string;
    team_id: string | null;
    status: string;
    created_at: Date;
    expires_at: Date;
  }): Invite {
    return {
      id: row.id,
      email: row.email,
      organizationId: row.organization_id,
      role: row.role.toUpperCase() as MembershipRole,
      invitedBy: row.invited_by,
      status: row.status as Invite['status'],
      teamId: row.team_id ?? undefined,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
    };
  }
}
