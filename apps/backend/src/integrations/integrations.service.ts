import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service.js';
import { encrypt, decrypt, isEncrypted } from '../common/crypto.js';
import type {
  Integration,
  IntegrationProvider,
  IntegrationProjectMapping,
  CreateIntegrationDto,
  CreateProjectMappingDto,
} from '@tandemu/types';

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
  encryption_key_version: number;
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
  private readonly logger = new Logger(IntegrationsService.name);
  private readonly encryptionKey: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    this.encryptionKey = this.configService.get<string>('encryption.key', '');
    if (this.encryptionKey) {
      this.logger.log('Token encryption: enabled');
    } else {
      this.logger.warn('Token encryption: disabled (ENCRYPTION_KEY not set)');
    }
  }

  private encryptToken(plaintext: string): string {
    if (!this.encryptionKey) return plaintext;
    return encrypt(plaintext, this.encryptionKey);
  }

  private decryptToken(stored: string): string {
    if (!this.encryptionKey) return stored;
    if (!isEncrypted(stored)) return stored; // plain text (legacy/OSS)
    return decrypt(stored, this.encryptionKey);
  }

  private get keyVersion(): number {
    return this.encryptionKey ? 1 : 0;
  }

  async create(orgId: string, dto: CreateIntegrationDto): Promise<Integration> {
    try {
      const encryptedToken = this.encryptToken(dto.accessToken);
      const encryptedRefresh = dto.refreshToken ? this.encryptToken(dto.refreshToken) : null;

      const result = await this.db.query<IntegrationRow>(
        `INSERT INTO integrations (organization_id, provider, access_token, refresh_token, external_workspace_id, external_workspace_name, encryption_key_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          orgId,
          dto.provider,
          encryptedToken,
          encryptedRefresh,
          dto.externalWorkspaceId ?? null,
          dto.externalWorkspaceName ?? null,
          this.keyVersion,
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

  async createOrUpdate(orgId: string, dto: CreateIntegrationDto): Promise<Integration> {
    const encryptedToken = this.encryptToken(dto.accessToken);
    const encryptedRefresh = dto.refreshToken ? this.encryptToken(dto.refreshToken) : null;

    const result = await this.db.query<IntegrationRow>(
      `INSERT INTO integrations (organization_id, provider, access_token, refresh_token, external_workspace_id, external_workspace_name, encryption_key_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (organization_id, provider)
       DO UPDATE SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
                     external_workspace_id = COALESCE(EXCLUDED.external_workspace_id, integrations.external_workspace_id),
                     external_workspace_name = COALESCE(EXCLUDED.external_workspace_name, integrations.external_workspace_name),
                     encryption_key_version = EXCLUDED.encryption_key_version, updated_at = now()
       RETURNING *`,
      [
        orgId,
        dto.provider,
        encryptedToken,
        encryptedRefresh,
        dto.externalWorkspaceId ?? null,
        dto.externalWorkspaceName ?? null,
        this.keyVersion,
      ],
    );
    return mapIntegration(result.rows[0]!);
  }

  async findAll(orgId: string): Promise<Array<Integration & { maskedToken: string }>> {
    const result = await this.db.query<IntegrationRow>(
      `SELECT * FROM integrations WHERE organization_id = $1`,
      [orgId],
    );
    return result.rows.map((row) => {
      // Decrypt to get the real token for masking (shows last 4 of actual token, not ciphertext)
      const plainToken = this.decryptToken(row.access_token);
      return {
        ...mapIntegration(row),
        maskedToken: maskToken(plainToken),
      };
    });
  }

  async findOne(orgId: string, provider: IntegrationProvider): Promise<IntegrationRow> {
    const result = await this.db.query<IntegrationRow>(
      `SELECT * FROM integrations WHERE organization_id = $1 AND provider = $2`,
      [orgId, provider],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException(`No ${provider} integration found for this organization`);
    }
    const row = result.rows[0]!;
    // Decrypt tokens before returning to callers (providers need plain text)
    return {
      ...row,
      access_token: this.decryptToken(row.access_token),
      refresh_token: row.refresh_token ? this.decryptToken(row.refresh_token) : null,
    };
  }

  async delete(orgId: string, provider: IntegrationProvider): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM integrations WHERE organization_id = $1 AND provider = $2`,
      [orgId, provider],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Re-encrypt all plain text tokens for an organization.
   * Called on startup or via admin endpoint when ENCRYPTION_KEY is set.
   */
  async reencryptTokens(): Promise<number> {
    if (!this.encryptionKey) return 0;

    const result = await this.db.query<IntegrationRow>(
      `SELECT * FROM integrations WHERE encryption_key_version = 0`,
    );

    let count = 0;
    for (const row of result.rows) {
      const encryptedToken = this.encryptToken(row.access_token);
      const encryptedRefresh = row.refresh_token ? this.encryptToken(row.refresh_token) : null;

      await this.db.query(
        `UPDATE integrations SET access_token = $1, refresh_token = $2, encryption_key_version = $3, updated_at = now() WHERE id = $4`,
        [encryptedToken, encryptedRefresh, this.keyVersion, row.id],
      );
      count++;
    }

    if (count > 0) {
      this.logger.log(`Re-encrypted ${count} integration token(s)`);
    }
    return count;
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
          'This project is already mapped to this team',
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
