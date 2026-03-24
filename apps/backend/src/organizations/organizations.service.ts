import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../database/database.service.js';
import type {
  Organization,
  CreateOrganizationDto,
  UpdateOrganizationDto,
  Membership,
} from '@tandemu/types';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateOrganizationDto, userId: string): Promise<Organization> {
    const result = await this.db.withTransaction(async (client) => {
      const orgResult = await client.query<{
        id: string;
        name: string;
        slug: string;
        stripe_customer_id: string | null;
        stripe_subscription_id: string | null;
        plan_tier: string;
        subscription_status: string;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO organizations (name, slug, plan_tier)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [dto.name, dto.slug, (dto.planTier ?? 'free').toLowerCase()],
      );
      const org = orgResult.rows[0]!;

      // Create membership for the creating user
      await client.query(
        `INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, $3)`,
        [userId, org.id, 'owner'],
      );

      return org;
    });

    return this.mapOrg(result);
  }

  async findAll(userId: string): Promise<Organization[]> {
    const result = await this.db.query<{
      id: string;
      name: string;
      slug: string;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
      plan_tier: string;
      subscription_status: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT o.* FROM organizations o
       INNER JOIN memberships m ON m.organization_id = o.id
       WHERE m.user_id = $1`,
      [userId],
    );

    return result.rows.map((row) => this.mapOrg(row));
  }

  async findOne(orgId: string): Promise<Organization> {
    const result = await this.db.query<{
      id: string;
      name: string;
      slug: string;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
      plan_tier: string;
      subscription_status: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT * FROM organizations WHERE id = $1`,
      [orgId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Organization with id ${orgId} not found`);
    }

    return this.mapOrg(result.rows[0]!);
  }

  async update(orgId: string, dto: UpdateOrganizationDto): Promise<Organization> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (dto.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(dto.name);
    }
    if (dto.slug !== undefined) {
      fields.push(`slug = $${paramIndex++}`);
      values.push(dto.slug);
    }
    if (dto.planTier !== undefined) {
      fields.push(`plan_tier = $${paramIndex++}`);
      values.push(dto.planTier.toLowerCase());
    }
    if (dto.subscriptionStatus !== undefined) {
      fields.push(`subscription_status = $${paramIndex++}`);
      values.push(dto.subscriptionStatus);
    }
    if (dto.stripeCustomerId !== undefined) {
      fields.push(`stripe_customer_id = $${paramIndex++}`);
      values.push(dto.stripeCustomerId);
    }
    if (dto.stripeSubscriptionId !== undefined) {
      fields.push(`stripe_subscription_id = $${paramIndex++}`);
      values.push(dto.stripeSubscriptionId);
    }

    if (fields.length === 0) {
      return this.findOne(orgId);
    }

    fields.push(`updated_at = now()`);
    values.push(orgId);

    const result = await this.db.query<{
      id: string;
      name: string;
      slug: string;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
      plan_tier: string;
      subscription_status: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `UPDATE organizations SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Organization with id ${orgId} not found`);
    }

    return this.mapOrg(result.rows[0]!);
  }

  async delete(orgId: string): Promise<boolean> {
    await this.db.query('DELETE FROM memberships WHERE organization_id = $1', [orgId]);
    const result = await this.db.query('DELETE FROM organizations WHERE id = $1', [orgId]);
    return (result.rowCount ?? 0) > 0;
  }

  async removeMember(orgId: string, userId: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM memberships WHERE organization_id = $1 AND user_id = $2',
      [orgId, userId],
    );
    const removed = (result.rowCount ?? 0) > 0;
    if (removed) {
      this.eventEmitter.emit('organization.membership_changed', { organizationId: orgId });
    }
    return removed;
  }

  async addMember(orgId: string, email: string, role: string): Promise<Membership> {
    const userResult = await this.db.query<{ id: string }>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundException(`User with email ${email} not found`);
    }

    const userId = userResult.rows[0]!.id;

    // Check for existing membership
    const existing = await this.db.query(
      'SELECT id FROM memberships WHERE user_id = $1 AND organization_id = $2',
      [userId, orgId],
    );

    if (existing.rows.length > 0) {
      throw new ConflictException('User is already a member of this organization');
    }

    const result = await this.db.query<{
      id: string;
      user_id: string;
      organization_id: string;
      role: string;
      created_at: Date;
    }>(
      `INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, $3) RETURNING *`,
      [userId, orgId, role.toLowerCase()],
    );

    const row = result.rows[0]!;
    this.eventEmitter.emit('organization.membership_changed', { organizationId: orgId });
    return {
      id: row.id,
      userId: row.user_id,
      organizationId: row.organization_id,
      role: row.role.toUpperCase() as Membership['role'],
      createdAt: row.created_at.toISOString(),
    };
  }

  async getMembers(orgId: string): Promise<Array<{ id: string; email: string; name: string; role: string }>> {
    const result = await this.db.query<{
      id: string;
      email: string;
      name: string;
      role: string;
    }>(
      `SELECT u.id, u.email, u.name, m.role
       FROM users u
       INNER JOIN memberships m ON m.user_id = u.id
       WHERE m.organization_id = $1`,
      [orgId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role.toUpperCase(),
    }));
  }

  private mapOrg(row: {
    id: string;
    name: string;
    slug: string;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    plan_tier: string;
    subscription_status: string;
    created_at: Date;
    updated_at: Date;
  }): Organization {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      stripeCustomerId: row.stripe_customer_id ?? undefined,
      stripeSubscriptionId: row.stripe_subscription_id ?? undefined,
      planTier: row.plan_tier.toUpperCase() as Organization['planTier'],
      subscriptionStatus: row.subscription_status as Organization['subscriptionStatus'],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
