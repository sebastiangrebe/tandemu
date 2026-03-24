import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { Team, TeamSettings, CreateTeamDto, UpdateTeamDto } from '@tandemu/types';

const DEFAULT_TEAM_SETTINGS: Required<TeamSettings> = {
  doneWindowDays: 14,
};

@Injectable()
export class TeamsService {
  constructor(private readonly db: DatabaseService) {}

  async create(orgId: string, dto: CreateTeamDto): Promise<Team> {
    const result = await this.db.query<TeamRow>(
      `INSERT INTO teams (name, description, organization_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [dto.name, dto.description ?? null, orgId],
    );

    return this.mapTeam(result.rows[0]!);
  }

  async findAll(orgId: string): Promise<Team[]> {
    const result = await this.db.query<TeamRow>(
      `SELECT * FROM teams WHERE organization_id = $1`,
      [orgId],
    );

    return result.rows.map((row) => this.mapTeam(row));
  }

  async findOne(teamId: string): Promise<Team> {
    const result = await this.db.query<TeamRow>(
      `SELECT * FROM teams WHERE id = $1`,
      [teamId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Team with id ${teamId} not found`);
    }

    return this.mapTeam(result.rows[0]!);
  }

  async update(teamId: string, dto: UpdateTeamDto): Promise<Team> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (dto.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(dto.name);
    }
    if (dto.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(dto.description);
    }
    if (dto.settings !== undefined) {
      // Merge new settings with existing settings using jsonb concat
      fields.push(`settings = settings || $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(dto.settings));
    }

    if (fields.length === 0) {
      return this.findOne(teamId);
    }

    fields.push(`updated_at = now()`);
    values.push(teamId);

    const result = await this.db.query<TeamRow>(
      `UPDATE teams SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Team with id ${teamId} not found`);
    }

    return this.mapTeam(result.rows[0]!);
  }

  async delete(teamId: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM teams WHERE id = $1', [teamId]);
    return (result.rowCount ?? 0) > 0;
  }

  async addMember(teamId: string, userId: string): Promise<{ id: string; teamId: string; userId: string; createdAt: string }> {
    // Verify the team exists
    const team = await this.db.query<{ id: string; organization_id: string }>(
      'SELECT id, organization_id FROM teams WHERE id = $1',
      [teamId],
    );

    if (team.rows.length === 0) {
      throw new NotFoundException(`Team with id ${teamId} not found`);
    }

    const orgId = team.rows[0]!.organization_id;

    // Verify the user is a member of the organization
    const membership = await this.db.query(
      'SELECT id FROM memberships WHERE user_id = $1 AND organization_id = $2',
      [userId, orgId],
    );

    if (membership.rows.length === 0) {
      throw new NotFoundException('User is not a member of this organization');
    }

    // Check for existing team membership
    const existing = await this.db.query(
      'SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2',
      [teamId, userId],
    );

    if (existing.rows.length > 0) {
      throw new ConflictException('User is already a member of this team');
    }

    const result = await this.db.query<{
      id: string;
      team_id: string;
      user_id: string;
      created_at: Date;
    }>(
      `INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) RETURNING *`,
      [teamId, userId],
    );

    const row = result.rows[0]!;
    return {
      id: row.id,
      teamId: row.team_id,
      userId: row.user_id,
      createdAt: row.created_at.toISOString(),
    };
  }

  async removeMember(teamId: string, userId: string): Promise<boolean> {
    const result = await this.db.query(
      'DELETE FROM team_members WHERE team_id = $1 AND user_id = $2',
      [teamId, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getMembers(teamId: string): Promise<Array<{ id: string; email: string; name: string; createdAt: string }>> {
    const result = await this.db.query<{
      id: string;
      email: string;
      name: string;
      created_at: Date;
    }>(
      `SELECT u.id, u.email, u.name, tm.created_at
       FROM users u
       INNER JOIN team_members tm ON tm.user_id = u.id
       WHERE tm.team_id = $1`,
      [teamId],
    );

    return result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async getSettings(teamId: string): Promise<Required<TeamSettings>> {
    const team = await this.findOne(teamId);
    return {
      ...DEFAULT_TEAM_SETTINGS,
      ...team.settings,
    };
  }

  private mapTeam(row: TeamRow): Team {
    const settings = (row.settings && typeof row.settings === 'object')
      ? row.settings as TeamSettings
      : {};
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      settings,
      organizationId: row.organization_id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

interface TeamRow {
  id: string;
  name: string;
  description: string | null;
  settings: unknown;
  organization_id: string;
  created_at: Date;
  updated_at: Date;
}
