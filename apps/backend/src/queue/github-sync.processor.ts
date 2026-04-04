import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import type { Job } from 'bullmq';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import { GitHubGitService } from '../integrations/providers/github-git.service.js';
import { GitHubSyncScheduler } from '../telemetry/github-sync.scheduler.js';
import type { GitHubSyncJobData } from './queue.types.js';

@Processor('github-sync')
export class GitHubSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(GitHubSyncProcessor.name);

  constructor(
    @Inject(forwardRef(() => TelemetryService))
    private readonly telemetryService: TelemetryService,
    @Inject(forwardRef(() => GitHubGitService))
    private readonly gitHubGitService: GitHubGitService,
    @Inject(forwardRef(() => GitHubSyncScheduler))
    private readonly scheduler: GitHubSyncScheduler,
  ) {
    super();
  }

  async process(job: Job<GitHubSyncJobData>): Promise<void> {
    // Trigger job: fan out per-repo sync jobs
    if (job.name === 'github-sync-trigger') {
      this.logger.log('GitHub sync trigger fired — fanning out per-repo jobs');
      await this.scheduler.triggerSyncForAllOrgs();
      return;
    }

    // Per-repo sync job
    const { token, repo, organizationId, teamId, since } = job.data;
    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) {
      this.logger.warn(`Invalid repo format: ${repo}`);
      return;
    }

    this.logger.log(`Syncing PRs for ${repo} (org: ${organizationId})`);

    const prs = await this.gitHubGitService.fetchMergedPRs(token, owner, repoName, {
      since,
      perPage: 50,
    });

    if (prs.length > 0) {
      await this.telemetryService.insertGitHubPRs(organizationId, repo, teamId, prs);
    }

    this.logger.log(`Synced ${prs.length} merged PRs for ${repo}`);
  }
}
