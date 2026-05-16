import { Processor } from '@nestjs/bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import type { Job } from 'bullmq';
import * as Sentry from '@sentry/nestjs';
import { SentryProcessor } from './sentry-processor.js';
import { TelemetryService } from '../telemetry/telemetry.service.js';
import { GitHubGitService } from '../integrations/providers/github-git.service.js';
import { GitHubSyncScheduler } from '../telemetry/github-sync.scheduler.js';
import type { GitHubSyncJobData } from './queue.types.js';

@Processor('github-sync')
export class GitHubSyncProcessor extends SentryProcessor {
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

  async run(job: Job<GitHubSyncJobData>): Promise<void> {
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

    // Generic repo cap. NULL = uncapped (OSS standalone-correct). Only *new*
    // repos beyond the cap are blocked; already-tracked repos keep syncing.
    const maxRepos = await this.telemetryService.maxReposFor(organizationId);
    if (maxRepos !== null) {
      const tracked = await this.telemetryService.repoAlreadyTracked(organizationId, repo);
      if (!tracked) {
        const distinct = await this.telemetryService.countDistinctRepos(organizationId);
        if (distinct >= maxRepos) {
          this.logger.warn(
            `Repo cap reached for org ${organizationId} (${distinct}/${maxRepos}); skipping new repo ${repo}`,
          );
          Sentry.captureMessage('github-sync repo cap reached', {
            level: 'warning',
            tags: { organizationId },
            extra: { repo, distinct, maxRepos },
          });
          return;
        }
      }
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

    // Sync PR reviews for the fetched PRs (review-latency metrics)
    try {
      let reviewCount = 0;
      for (const pr of prs) {
        const reviews = await this.gitHubGitService.fetchPRReviews(token, owner, repoName, pr.number);
        if (reviews.length > 0) {
          await this.telemetryService.insertGitHubPRReviews(organizationId, repo, teamId, pr, reviews);
          reviewCount += reviews.length;
        }
      }
      this.logger.log(`Synced ${reviewCount} PR reviews across ${prs.length} PRs for ${repo}`);
    } catch (err) {
      this.logger.warn(`Failed to sync PR reviews for ${repo}: ${err}`);
    }

    // Sync GitHub Deployments (for proper DORA deployment tracking)
    try {
      const deployments = await this.gitHubGitService.fetchDeployments(token, owner, repoName, {
        since,
        environment: 'production',
        perPage: 50,
      });

      if (deployments.length > 0) {
        await this.telemetryService.insertGitHubDeployments(organizationId, repo, teamId, deployments);
      }

      this.logger.log(`Synced ${deployments.length} deployments for ${repo}`);
    } catch (err) {
      this.logger.warn(`Failed to sync deployments for ${repo}: ${err}`);
    }
  }
}
