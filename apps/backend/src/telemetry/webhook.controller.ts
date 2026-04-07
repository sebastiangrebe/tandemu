import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { TelemetryService } from './telemetry.service.js';

interface DeploymentWebhookBody {
  repo: string;
  sha: string;
  environment: string;
  status: 'success' | 'failure';
  timestamp: string;
  description?: string;
  teamId?: string;
}

interface IncidentWebhookBody {
  incidentId: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  status: 'triggered' | 'acknowledged' | 'resolved';
  serviceName?: string;
  createdAt: string;
  resolvedAt?: string;
  tags?: string[];
  teamId?: string;
}

@Controller('api')
export class WebhookController {
  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => TelemetryService))
    private readonly telemetryService: TelemetryService,
  ) {}

  @Post('deployments')
  @HttpCode(HttpStatus.OK)
  async ingestDeployment(
    @Headers('authorization') auth: string,
    @Body() body: DeploymentWebhookBody,
  ) {
    const org = await this.validateIngestionKey(auth);

    // Generate a synthetic deployment_id from the unique combination
    const syntheticId = this.hashToUint64(`${body.repo}:${body.sha}:${body.timestamp}`);

    await this.telemetryService.insertGitHubDeployments(
      org.id,
      body.repo,
      body.teamId ?? '',
      [{
        id: syntheticId,
        sha: body.sha,
        ref: '',
        environment: body.environment,
        creator: 'webhook',
        createdAt: body.timestamp,
        description: body.description ?? '',
        status: body.status,
        statusUpdatedAt: body.timestamp,
      }],
    );

    return { success: true };
  }

  @Post('incidents')
  @HttpCode(HttpStatus.OK)
  async ingestIncident(
    @Headers('authorization') auth: string,
    @Body() body: IncidentWebhookBody,
  ) {
    const org = await this.validateIngestionKey(auth);

    await this.telemetryService.insertIncidents(
      org.id,
      body.teamId ?? '',
      [{
        incidentId: body.incidentId,
        provider: 'webhook',
        title: body.title,
        severity: body.severity,
        status: body.status,
        serviceName: body.serviceName,
        createdAt: body.createdAt,
        resolvedAt: body.resolvedAt,
        tags: body.tags,
      }],
    );

    return { success: true };
  }

  private async validateIngestionKey(authHeader: string): Promise<{ id: string }> {
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const key = authHeader.slice(7).trim();
    if (!key) {
      throw new UnauthorizedException('Empty ingestion key');
    }

    const result = await this.db.query<{ id: string }>(
      'SELECT id FROM organizations WHERE ingestion_key = $1',
      [key],
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedException('Invalid ingestion key');
    }

    return result.rows[0]!;
  }

  private hashToUint64(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}
