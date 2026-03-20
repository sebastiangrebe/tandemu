import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type {
  Integration,
  IntegrationProvider,
  IntegrationProjectMapping,
  CreateIntegrationDto,
  CreateProjectMappingDto,
} from '@tandem/types';

interface IntegrationRow {
  id: string;
  organization_id: string;
  provider: IntegrationProvider;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: Date | null;
  external_workspace_id: string | null;
  external_workspace_name: string | null;
  config: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface MappingRow {
  id: string;
  integration_id: string;
  team_id: string;
  external_project_id: string;
  external_project_name: string | null;
  config: Record<string, unknown>;
  created_at: Date;
}

function maskToken(token: string): string {
  if (token.length <= 4) return '****';
  return `****...${token.slice(-4)}`;
}

function mapIntegration(row: IntegrationRow): Integration {
  return {
    id: row.id,
    organizationId: row.organization_id,
    provider: row.provider,
    externalWorkspaceId: row.external_workspace_id ?? undefined,
    externalWorkspaceName: row.external_workspace_name ?? undefined,
    config: row.config,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapMapping(row: MappingRow): IntegrationProjectMapping {
  return {
    id: row.id,
    integrationId: row.integration_id,
    teamId: row.team_id,
    externalProjectId: row.external_project_id,
    externalProjectName: row.external_project_name ?? undefined,
    config: row.config,
    createdAt: row.created_at.toISOString(),
  };
}

@Injectable()
export class IntegrationsService {
  constructor(private readonly db: DatabaseService) {}

  async create(orgId: string, dto: CreateIntegrationDto): Promise<Integration> {
    try {
      const result = await this.db.query<IntegrationRow>(
        `INSERT INTO integrations (organization_id, provider, access_token, refresh_token, external_workspace_id, external_workspace_name)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          orgId,
          dto.provider,
          dto.accessToken,
          dto.refreshToken ?? null,
          dto.externalWorkspaceId ?? null,
          dto.externalWorkspaceName ?? null,
        ],
      );
      return mapIntegration(result.rows[0]!);
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && (error as { code: string }).code === '23505') {
        throw new ConflictException(
          `Integration for provider "${dto.provider}" already exists in this organization`,
        );
      }
      throw error;
    }
  }

  async findAll(orgId: string): Promise<Array<Integration & { maskedToken: string }>> {
    const result = await this.db.query<IntegrationRow>(
      `SELECT * FROM integrations WHERE organization_id = $1`,
      [orgId],
    );
    return result.rows.map((row) => ({
      ...mapIntegration(row),
      maskedToken: maskToken(row.access_token),
    }));
  }

  async findOne(orgId: string, provider: IntegrationProvider): Promise<IntegrationRow> {
    const result = await this.db.query<IntegrationRow>(
      `SELECT * FROM integrations WHERE organization_id = $1 AND provider = $2`,
      [orgId, provider],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`No ${provider} integration found for this organization`);
    }
    return result.rows[0]!;
  }

  async delete(orgId: string, provider: IntegrationProvider): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM integrations WHERE organization_id = $1 AND provider = $2`,
      [orgId, provider],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async createMapping(integrationId: string, dto: CreateProjectMappingDto): Promise<IntegrationProjectMapping> {
    try {
      const result = await this.db.query<MappingRow>(
        `INSERT INTO integration_project_mappings (integration_id, team_id, external_project_id, external_project_name, config)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          integrationId,
          dto.teamId,
          dto.externalProjectId,
          dto.externalProjectName ?? null,
          JSON.stringify(dto.config ?? {}),
        ],
      );
      return mapMapping(result.rows[0]!);
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && (error as { code: string }).code === '23505') {
        throw new ConflictException(
          'A project mapping already exists for this team and integration',
        );
      }
      throw error;
    }
  }

  async getMappings(integrationId: string): Promise<IntegrationProjectMapping[]> {
    const result = await this.db.query<MappingRow>(
      `SELECT * FROM integration_project_mappings WHERE integration_id = $1`,
      [integrationId],
    );
    return result.rows.map(mapMapping);
  }

  async deleteMapping(mappingId: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM integration_project_mappings WHERE id = $1`,
      [mappingId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
