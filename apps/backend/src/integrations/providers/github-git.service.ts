import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { githubFetch } from './github.provider.js';

const GITHUB_API = 'https://api.github.com';

export interface GitCommitData {
  sha: string;
  message: string;
  author: { name: string; email: string; login?: string };
  date: string;
  files?: string[];
  hasCoAuthorClaude: boolean;
}

export interface GitPRData {
  number: number;
  title: string;
  body: string;
  createdAt: string;
  mergedAt: string;
  author: { login: string };
  url: string;
  labels: string[];
  files?: string[];
}

export interface GitDeploymentData {
  id: number;
  sha: string;
  ref: string;
  environment: string;
  creator: string;
  createdAt: string;
  description: string;
  status: string;
  statusUpdatedAt: string;
}

export interface GitPRReviewData {
  id: number;
  reviewer: string;
  state: string;
  submittedAt: string;
}

interface GitHubCommitResponse {
  sha: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string };
  };
  author?: { login: string } | null;
}

interface GitHubPRResponse {
  number: number;
  title: string;
  body: string | null;
  created_at: string;
  merged_at: string | null;
  html_url: string;
  user: { login: string } | null;
  labels: Array<{ name: string }>;
}

interface GitHubReviewResponse {
  id: number;
  user: { login: string } | null;
  state: string;
  submitted_at: string | null;
}

interface GitHubDeploymentResponse {
  id: number;
  sha: string;
  ref: string;
  environment: string;
  description: string | null;
  creator: { login: string } | null;
  created_at: string;
}

interface GitHubDeploymentStatusResponse {
  state: string;
  created_at: string;
  environment: string;
}

interface GitHubSearchResponse {
  items: Array<{
    number: number;
    title: string;
    body: string | null;
    created_at: string;
    pull_request?: { merged_at: string | null; html_url: string };
    user: { login: string } | null;
    labels: Array<{ name: string }>;
  }>;
}

export interface FetchOptions {
  since?: string;
  branch?: string;
  perPage?: number;
}

@Injectable()
export class GitHubGitService {
  private readonly logger = new Logger(GitHubGitService.name);

  async fetchRecentCommits(
    token: string,
    owner: string,
    repo: string,
    options?: FetchOptions,
  ): Promise<GitCommitData[]> {
    const params = new URLSearchParams();
    if (options?.since) params.set('since', options.since);
    if (options?.branch) params.set('sha', options.branch);
    params.set('per_page', String(options?.perPage ?? 50));

    const url = `${GITHUB_API}/repos/${owner}/${repo}/commits?${params}`;
    try {
      const commits = await githubFetch<GitHubCommitResponse[]>(url, token);
      return commits.map((c) => ({
        sha: c.sha,
        message: c.commit.message.split('\n')[0]!,
        author: {
          name: c.commit.author.name,
          email: c.commit.author.email,
          login: c.author?.login,
        },
        date: c.commit.author.date,
        hasCoAuthorClaude: c.commit.message.includes('Co-Authored-By: Claude'),
      }));
    } catch (error) {
      this.logger.warn(`Failed to fetch commits for ${owner}/${repo} (token may lack repo access): ${error}`);
      Sentry.captureException(error, { tags: { operation: 'provider-github-fetch-commits' }, extra: { owner, repo } });
      return [];
    }
  }

  async fetchMergedPRs(
    token: string,
    owner: string,
    repo: string,
    options?: FetchOptions,
  ): Promise<GitPRData[]> {
    const params = new URLSearchParams({
      state: 'closed',
      sort: 'updated',
      direction: 'desc',
      per_page: String(options?.perPage ?? 30),
    });

    const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls?${params}`;
    try {
      const prs = await githubFetch<GitHubPRResponse[]>(url, token);
      return prs
        .filter((pr) => {
          if (!pr.merged_at) return false;
          if (options?.since && pr.merged_at < options.since) return false;
          return true;
        })
        .map((pr) => ({
          number: pr.number,
          title: pr.title,
          body: pr.body ?? '',
          createdAt: pr.created_at,
          mergedAt: pr.merged_at!,
          author: { login: pr.user?.login ?? 'unknown' },
          url: pr.html_url,
          labels: pr.labels.map((l) => l.name),
        }));
    } catch (error) {
      this.logger.warn(`Failed to fetch PRs for ${owner}/${repo} (token may lack repo access): ${error}`);
      Sentry.captureException(error, { tags: { operation: 'provider-github-fetch-prs' }, extra: { owner, repo } });
      return [];
    }
  }

  async fetchPRReviews(
    token: string,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<GitPRReviewData[]> {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/reviews?per_page=100`;
    try {
      const reviews = await githubFetch<GitHubReviewResponse[]>(url, token);
      return reviews
        .filter((r) => r.submitted_at && r.user?.login)
        .map((r) => ({
          id: r.id,
          reviewer: r.user!.login,
          state: r.state,
          submittedAt: r.submitted_at!,
        }));
    } catch (error) {
      this.logger.warn(`Failed to fetch reviews for ${owner}/${repo}#${prNumber}: ${error}`);
      Sentry.captureException(error, { tags: { operation: 'provider-github-fetch-pr-reviews' }, extra: { owner, repo, prNumber } });
      return [];
    }
  }

  async fetchPRsForFile(
    token: string,
    owner: string,
    repo: string,
    filePath: string,
  ): Promise<GitPRData[]> {
    const query = encodeURIComponent(
      `repo:${owner}/${repo} type:pr is:merged ${filePath}`,
    );
    const url = `${GITHUB_API}/search/issues?q=${query}&sort=updated&order=desc&per_page=10`;

    try {
      const result = await githubFetch<GitHubSearchResponse>(url, token);
      return result.items
        .filter((item) => item.pull_request?.merged_at)
        .map((item) => ({
          number: item.number,
          title: item.title,
          body: item.body ?? '',
          createdAt: item.created_at,
          mergedAt: item.pull_request!.merged_at!,
          author: { login: item.user?.login ?? 'unknown' },
          url: item.pull_request!.html_url,
          labels: item.labels.map((l) => l.name),
        }));
    } catch (error) {
      this.logger.warn(`Failed to search PRs for file ${filePath}: ${error}`);
      Sentry.captureException(error, { tags: { operation: 'provider-github-fetch-prs-for-file' }, extra: { filePath } });
      return [];
    }
  }

  async fetchDeployments(
    token: string,
    owner: string,
    repo: string,
    options?: { since?: string; environment?: string; perPage?: number },
  ): Promise<GitDeploymentData[]> {
    const params = new URLSearchParams({
      per_page: String(options?.perPage ?? 50),
    });
    if (options?.environment) {
      params.set('environment', options.environment);
    }

    const url = `${GITHUB_API}/repos/${owner}/${repo}/deployments?${params}`;
    try {
      const deployments = await githubFetch<GitHubDeploymentResponse[]>(url, token);

      const results: GitDeploymentData[] = [];
      for (const d of deployments) {
        // Client-side date filter
        if (options?.since && d.created_at < options.since) continue;

        // Fetch latest status for this deployment (first item = most recent)
        const statusUrl = `${GITHUB_API}/repos/${owner}/${repo}/deployments/${d.id}/statuses?per_page=1`;
        try {
          const statuses = await githubFetch<GitHubDeploymentStatusResponse[]>(statusUrl, token);
          const latest = statuses[0];
          if (!latest) continue;

          // Only include successful deployments (actual production deploys)
          if (latest.state !== 'success') continue;

          results.push({
            id: d.id,
            sha: d.sha,
            ref: d.ref,
            environment: d.environment,
            creator: d.creator?.login ?? 'unknown',
            createdAt: d.created_at,
            description: d.description ?? '',
            status: latest.state,
            statusUpdatedAt: latest.created_at,
          });
        } catch {
          // Skip deployments where status fetch fails
        }
      }

      return results;
    } catch (error) {
      this.logger.warn(`Failed to fetch deployments for ${owner}/${repo}: ${error}`);
      return [];
    }
  }
}
