import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { DatabaseService } from '../database/database.service.js';
import { IntegrationsService } from '../integrations/integrations.service.js';
import type { GitHubSyncJobData } from '../queue/queue.types.js';

@Injectable()
export class GitHubSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(GitHubSyncScheduler.name);

  constructor(
    @InjectQueue('github-sync') private readonly syncQueue: Queue<GitHubSyncJobData>,
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => IntegrationsService))
    private readonly integrationsService: IntegrationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Register repeatable job: every 4 hours
    await this.syncQueue.add(
      'github-sync-trigger',
      { type: 'github-sync' } as GitHubSyncJobData,
      {
        repeat: { pattern: '0 */4 * * *' },
        jobId: 'github-sync-repeatable',
      },
    );

    // Run an initial sync on startup (unique jobId per boot to avoid Bull dedup)
    await this.syncQueue.add(
      'github-sync-trigger',
      { type: 'github-sync' } as GitHubSyncJobData,
      {
        delay: 30_000,
        jobId: `github-sync-initial-${Date.now()}`,
      },
    );

    this.logger.log('GitHub sync scheduler registered (every 4h)');
  }

  /**
   * Fan out sync jobs for all orgs with GitHub integrations.
   * Called by the processor when the trigger job fires.
   */
  async triggerSyncForAllOrgs(): Promise<void> {
    try {
      const orgs = await this.db.query<{ organization_id: string }>(
        `SELECT DISTINCT organization_id FROM integrations WHERE provider = 'github'`,
      );

      const since = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 day overlap

      for (const { organization_id } of orgs.rows) {
        await this.triggerSync(organization_id, since);
      }

      this.logger.log(`Triggered GitHub sync for ${orgs.rows.length} org(s)`);
    } catch (err) {
      this.logger.warn(`Failed to trigger GitHub sync: ${err}`);
    }
  }

  /**
   * Trigger sync for a single organization. Useful for manual triggers
   * or when a new GitHub integration is connected.
   */
  async triggerSync(organizationId: string, since?: string): Promise<void> {
    try {
      const integration = await this.integrationsService.findOne(organizationId, 'github');
      const mappings = await this.integrationsService.getMappings(integration.id);

      if (mappings.length === 0) {
        this.logger.warn(`GitHub integration found for org ${organizationId} but no repo mappings`);
        return;
      }

      for (const mapping of mappings) {
        this.logger.log(`Queuing sync for ${mapping.externalProjectId} (team: ${mapping.teamId})`);
        await this.syncQueue.add('github-sync', {
          type: 'github-sync',
          organizationId,
          integrationId: integration.id,
          repo: mapping.externalProjectId,
          teamId: mapping.teamId,
          token: integration.access_token,
          since: since ?? new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    } catch (err) {
      this.logger.warn(`GitHub sync skipped for org ${organizationId}: ${err instanceof Error ? err.message : err}`);
    }
  }
}
