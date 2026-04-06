import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { DatabaseService } from '../database/database.service.js';
import { IntegrationsService } from '../integrations/integrations.service.js';
import type { IncidentSyncJobData } from '../queue/queue.types.js';

@Injectable()
export class IncidentSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(IncidentSyncScheduler.name);

  constructor(
    @InjectQueue('incident-sync') private readonly syncQueue: Queue<IncidentSyncJobData>,
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => IntegrationsService))
    private readonly integrationsService: IntegrationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Register repeatable job: every 4 hours
    await this.syncQueue.add(
      'incident-sync-trigger',
      { type: 'incident-sync-trigger' } as IncidentSyncJobData,
      {
        repeat: { pattern: '0 */4 * * *' },
        jobId: 'incident-sync-repeatable',
      },
    );

    // Run an initial sync on startup
    await this.syncQueue.add(
      'incident-sync-trigger',
      { type: 'incident-sync-trigger' } as IncidentSyncJobData,
      {
        delay: 45_000, // 45s after boot (after github-sync initial)
        jobId: `incident-sync-initial-${Date.now()}`,
      },
    );

    this.logger.log('Incident sync scheduler registered (every 4h)');
  }

  async triggerSyncForAllOrgs(): Promise<void> {
    try {
      const orgs = await this.db.query<{ organization_id: string; provider: string }>(
        `SELECT DISTINCT organization_id, provider FROM integrations WHERE provider IN ('pagerduty', 'opsgenie')`,
      );

      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 day window
      let succeeded = 0;

      for (const row of orgs.rows) {
        try {
          await this.triggerSync(row.organization_id, row.provider as 'pagerduty' | 'opsgenie', since);
          succeeded++;
        } catch (err) {
          this.logger.warn(`Incident sync failed for org ${row.organization_id} (${row.provider}): ${err instanceof Error ? err.message : err}`);
        }
      }

      this.logger.log(`Triggered incident sync for ${succeeded}/${orgs.rows.length} integration(s)`);
    } catch (err) {
      this.logger.warn(`Failed to query orgs for incident sync: ${err}`);
    }
  }

  async triggerSync(
    organizationId: string,
    provider: 'pagerduty' | 'opsgenie',
    since?: string,
  ): Promise<void> {
    try {
      const integration = await this.integrationsService.findOne(organizationId, provider);
      const mappings = await this.integrationsService.getMappings(integration.id);

      if (mappings.length === 0) {
        // No mappings — sync org-wide (empty teamId)
        await this.syncQueue.add('incident-sync', {
          type: 'incident-sync',
          organizationId,
          provider,
          teamId: '',
          token: integration.access_token,
          since: since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          config: integration.config,
        });
        return;
      }

      for (const mapping of mappings) {
        await this.syncQueue.add('incident-sync', {
          type: 'incident-sync',
          organizationId,
          provider,
          teamId: mapping.teamId,
          token: integration.access_token,
          since: since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          config: { ...integration.config, ...mapping.config },
        });
      }
    } catch (err) {
      this.logger.warn(`Incident sync skipped for org ${organizationId} (${provider}): ${err instanceof Error ? err.message : err}`);
    }
  }
}
