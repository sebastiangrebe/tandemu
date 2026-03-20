import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { Invite, MembershipRole } from '@tandem/types';

@Injectable()
export class InvitesService {
  constructor(private readonly db: DatabaseService) {}

  async create(orgId: string, email: string, role: MembershipRole, invitedBy: string): Promise<Invite> {
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
      status: string;
      created_at: Date;
      expires_at: Date;
    }>(
      `INSERT INTO invites (email, organization_id, role, invited_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [email, orgId, role.toLowerCase(), invitedBy],
    );

    return this.mapInvite(result.rows[0]!);
  }

  async findAllForOrg(orgId: string): Promise<Invite[]> {
    const result = await this.db.query<{
      id: string;
      email: string;
      organization_id: string;
      role: string;
      invited_by: string;
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

    // Use a transaction to accept the invite and create the membership
    const result = await this.db.withTransaction(async (client) => {
      // Update invite status
      const updatedInvite = await client.query<{
        id: string;
        email: string;
        organization_id: string;
        role: string;
        invited_by: string;
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

      return updatedInvite.rows[0]!;
    });

    return this.mapInvite(result);
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
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
    };
  }
}
