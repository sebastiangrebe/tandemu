import {
  BadGatewayException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Task, TaskStatus, TaskPriority } from '@tandemu/types';
import type {
  TaskProvider,
  TaskProviderFetchParams,
  TaskProviderFetchProjectsParams,
  TaskProviderUpdateParams,
  TaskProviderCreateParams,
  ExternalProject,
  ProviderStatus,
} from './task-provider.interface.js';

const GITHUB_API = 'https://api.github.com';

function mapStatus(state: string): TaskStatus {
  switch (state) {
    case 'open':
      return 'todo';
    case 'closed':
      return 'done';
    default:
      return 'todo';
  }
}

function mapPriority(labels: Array<{ name: string }>): TaskPriority {
  for (const label of labels) {
    const name = label.name.toLowerCase();
    if (name.includes('urgent') || name.includes('critical')) return 'urgent';
    if (name.includes('high') || name.includes('priority: high')) return 'high';
    if (name.includes('medium') || name.includes('priority: medium')) return 'medium';
    if (name.includes('low') || name.includes('priority: low')) return 'low';
  }
  return 'none';
}

export async function githubFetch<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new HttpException(
        'GitHub API rate limit exceeded. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const body = await response.text();
    throw new BadGatewayException(
      `GitHub API error (${response.status}): ${body}`,
    );
  }

  return response.json() as Promise<T>;
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  labels: Array<{ name: string }>;
  assignee: { login: string; email?: string } | null;
  milestone: { title: string } | null;
  updated_at: string;
}

interface GitHubRepo {
  full_name: string;
  name: string;
}

export class GitHubProvider implements TaskProvider {
  async fetchTasks(params: TaskProviderFetchParams): Promise<Task[]> {
    const { accessToken, externalProjectId, assigneeEmail, assigneeEmails, excludeDone } = params;
    const emails = assigneeEmails ?? (assigneeEmail ? [assigneeEmail] : []);
    // externalProjectId is "owner/repo"
    const state = excludeDone ? 'open' : 'all';
    let url = `${GITHUB_API}/repos/${externalProjectId}/issues?state=${state}&per_page=100`;
    if (emails.length > 0) {
      // GitHub uses usernames, not emails, for assignment filtering.
      // The config can map email -> username, otherwise we fetch all and filter.
      const emailToUsername = (params.config?.emailToUsername as Record<string, string>) ?? {};
      const username = emails.map((e) => emailToUsername[e]).find(Boolean);
      if (username) {
        url += `&assignee=${encodeURIComponent(username)}`;
      }
    }

    const issues = await githubFetch<GitHubIssue[]>(url, accessToken);

    return issues
      .filter((issue) => !('pull_request' in issue))
      .map((issue): Task => ({
        id: String(issue.number),
        title: issue.title,
        description: issue.body ?? undefined,
        status: mapStatus(issue.state),
        priority: mapPriority(issue.labels),
        assigneeName: issue.assignee?.login,
        assigneeEmail: issue.assignee?.email ?? undefined,
        labels: issue.labels.map((l) => l.name),
        sprint: issue.milestone?.title,
        url: issue.html_url,
        provider: 'github',
        externalProjectId,
        updatedAt: issue.updated_at,
      }));
  }

  async getTaskStatuses(_params: { accessToken: string; taskId: string; config: Record<string, unknown> }): Promise<ProviderStatus[]> {
    // GitHub Issues only have two states
    return [
      { id: 'open', name: 'open' },
      { id: 'closed', name: 'closed' },
    ];
  }

  async updateTask(params: TaskProviderUpdateParams): Promise<void> {
    const { accessToken, taskId, statusName, assigneeEmail, priority, description, config } = params;
    const repo = config.repo as string | undefined;
    if (!repo) return;

    const body: Record<string, unknown> = {};
    if (statusName) body.state = statusName.toLowerCase();
    if (assigneeEmail) {
      body.assignees = [assigneeEmail.split('@')[0]];
    }
    if (priority) {
      // GitHub uses labels for priority — add a priority label
      body.labels = [`priority:${priority.toLowerCase()}`];
    }
    if (description) body.body = description;

    if (Object.keys(body).length === 0) return;

    const response = await fetch(`${GITHUB_API}/repos/${repo}/issues/${taskId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new BadGatewayException(`GitHub issue update failed (${response.status}): ${body}`);
    }
  }

  async createTask(params: TaskProviderCreateParams): Promise<Task> {
    const { accessToken, externalProjectId, title, description, labels } = params;
    // externalProjectId is "owner/repo"
    const body: Record<string, unknown> = { title };
    if (description) body.body = description;
    if (labels && labels.length > 0) body.labels = labels;

    const res = await fetch(`${GITHUB_API}/repos/${externalProjectId}/issues`, {
      method: 'POST',
      headers: { Authorization: `token ${accessToken}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new BadGatewayException(`GitHub create issue failed (${res.status}): ${text}`);
    }
    const issue = (await res.json()) as GitHubIssue;
    return {
      id: `#${issue.number}`,
      title: issue.title,
      description: issue.body ?? undefined,
      status: mapStatus(issue.state),
      priority: mapPriority(issue.labels),
      assigneeName: issue.assignee?.login,
      assigneeEmail: issue.assignee?.email ?? undefined,
      labels: issue.labels.map((l) => l.name),
      url: issue.html_url,
      provider: 'github',
      externalProjectId,
      updatedAt: issue.updated_at,
    };
  }

  async fetchProjects(params: TaskProviderFetchProjectsParams): Promise<ExternalProject[]> {
    const { accessToken, externalWorkspaceId } = params;
    // externalWorkspaceId is the GitHub org name; if not set, list user repos
    const url = externalWorkspaceId
      ? `${GITHUB_API}/orgs/${encodeURIComponent(externalWorkspaceId)}/repos?per_page=100`
      : `${GITHUB_API}/user/repos?per_page=100`;

    const repos = await githubFetch<GitHubRepo[]>(url, accessToken);

    return repos.map((repo) => ({
      id: repo.full_name,
      name: repo.name,
    }));
  }
}
