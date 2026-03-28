import { Injectable, Logger } from '@nestjs/common';
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
  mergedAt: string;
  author: { login: string };
  url: string;
  labels: string[];
  files?: string[];
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
  merged_at: string | null;
  html_url: string;
  user: { login: string } | null;
  labels: Array<{ name: string }>;
}

interface GitHubSearchResponse {
  items: Array<{
    number: number;
    title: string;
    body: string | null;
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
          mergedAt: pr.merged_at!,
          author: { login: pr.user?.login ?? 'unknown' },
          url: pr.html_url,
          labels: pr.labels.map((l) => l.name),
        }));
    } catch (error) {
      this.logger.warn(`Failed to fetch PRs for ${owner}/${repo} (token may lack repo access): ${error}`);
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
          mergedAt: item.pull_request!.merged_at!,
          author: { login: item.user?.login ?? 'unknown' },
          url: item.pull_request!.html_url,
          labels: item.labels.map((l) => l.name),
        }));
    } catch (error) {
      this.logger.warn(`Failed to search PRs for file ${filePath}: ${error}`);
      return [];
    }
  }
}
