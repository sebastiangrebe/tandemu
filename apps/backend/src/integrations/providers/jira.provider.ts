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
  ExternalProject,
  ProviderStatus,
} from './task-provider.interface.js';

function mapStatus(statusName: string): TaskStatus {
  const lower = statusName.toLowerCase();
  if (lower === 'done' || lower === 'closed' || lower === 'resolved') return 'done';
  if (lower === 'in progress' || lower === 'in development') return 'in_progress';
  if (lower === 'in review' || lower === 'review' || lower === 'code review') return 'in_review';
  if (lower === 'cancelled' || lower === 'rejected' || lower === 'won\'t do') return 'cancelled';
  return 'todo';
}

function mapPriority(priorityName: string | undefined): TaskPriority {
  if (!priorityName) return 'none';
  const lower = priorityName.toLowerCase();
  if (lower === 'highest' || lower === 'blocker' || lower === 'critical') return 'urgent';
  if (lower === 'high') return 'high';
  if (lower === 'medium' || lower === 'normal') return 'medium';
  if (lower === 'low') return 'low';
  if (lower === 'lowest' || lower === 'trivial') return 'low';
  return 'none';
}

async function jiraFetch<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new HttpException(
        'Jira API rate limit exceeded. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const body = await response.text();
    throw new BadGatewayException(
      `Jira API error (${response.status}): ${body}`,
    );
  }

  return response.json() as Promise<T>;
}

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description?: unknown;
    status: { name: string };
    priority?: { name: string };
    assignee?: { displayName: string; emailAddress?: string };
    labels: string[];
    sprint?: { name: string };
    updated: string;
  };
}

interface JiraSearchResponse {
  issues: JiraIssue[];
  total: number;
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
}

export class JiraProvider implements TaskProvider {
  async fetchTasks(params: TaskProviderFetchParams): Promise<Task[]> {
    const { accessToken, externalProjectId, assigneeEmail, sprint, excludeDone, config } = params;
    const siteId = config.siteId as string | undefined;
    if (!siteId) {
      throw new BadGatewayException('Jira integration requires a siteId in config');
    }

    const baseUrl = `https://${siteId}.atlassian.net/rest/api/3`;

    let jql = `project = "${externalProjectId}"`;
    if (assigneeEmail) {
      jql += ` AND assignee = "${assigneeEmail}"`;
    }
    if (sprint === 'current') {
      jql += ' AND sprint in openSprints()';
    } else if (sprint) {
      jql += ` AND sprint = "${sprint}"`;
    }
    if (excludeDone) {
      jql += ' AND statusCategory != "Done"';
    }

    const url = `${baseUrl}/search?jql=${encodeURIComponent(jql)}&maxResults=100&fields=summary,description,status,priority,assignee,labels,sprint,updated`;

    const data = await jiraFetch<JiraSearchResponse>(url, accessToken);

    return data.issues.map((issue): Task => ({
      id: issue.key,
      title: issue.fields.summary,
      description: issue.fields.description
        ? JSON.stringify(issue.fields.description)
        : undefined,
      status: mapStatus(issue.fields.status.name),
      priority: mapPriority(issue.fields.priority?.name),
      assigneeName: issue.fields.assignee?.displayName,
      assigneeEmail: issue.fields.assignee?.emailAddress,
      labels: issue.fields.labels,
      sprint: issue.fields.sprint?.name,
      url: `https://${siteId}.atlassian.net/browse/${issue.key}`,
      provider: 'jira',
      externalProjectId,
      updatedAt: issue.fields.updated,
    }));
  }

  async getTaskStatuses(params: { accessToken: string; taskId: string; config: Record<string, unknown> }): Promise<ProviderStatus[]> {
    const { accessToken, taskId, config } = params;
    const siteId = config.siteId as string | undefined;
    if (!siteId) return [];

    const baseUrl = `https://${siteId}.atlassian.net/rest/api/3`;

    const res = await fetch(`${baseUrl}/issue/${taskId}/transitions`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.email}:${accessToken}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) return [];

    const data = await res.json() as {
      transitions: Array<{ id: string; name: string; to: { name: string } }>;
    };

    return data.transitions.map((t) => ({
      id: t.id,
      name: t.to.name,
      type: t.name,  // transition name (e.g., "Start Progress", "Done")
    }));
  }

  async updateTask(params: TaskProviderUpdateParams): Promise<void> {
    const { accessToken, taskId, statusName, assigneeEmail, config } = params;
    const siteId = config.siteId as string | undefined;
    if (!siteId) return;

    const baseUrl = `https://${siteId}.atlassian.net/rest/api/3`;
    const authHeader = `Basic ${Buffer.from(`${config.email}:${accessToken}`).toString('base64')}`;

    if (statusName) {
      const statuses = await this.getTaskStatuses({ accessToken, taskId, config });
      const transition = statuses.find((s) => s.name.toLowerCase() === statusName.toLowerCase());
      if (transition) {
        const res = await fetch(`${baseUrl}/issue/${taskId}/transitions`, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ transition: { id: transition.id } }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new BadGatewayException(`Jira transition failed (${res.status}): ${body}`);
        }
      }
    }

    if (assigneeEmail) {
      // Jira Cloud uses accountId, look up by email
      const searchRes = await fetch(
        `${baseUrl}/user/search?query=${encodeURIComponent(assigneeEmail)}`,
        { headers: { Authorization: authHeader, Accept: 'application/json' } },
      );
      if (searchRes.ok) {
        const users = (await searchRes.json()) as Array<{ accountId: string }>;
        if (users[0]) {
          await fetch(`${baseUrl}/issue/${taskId}/assignee`, {
            method: 'PUT',
            headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: users[0].accountId }),
          });
        }
      }
    }
  }

  async fetchProjects(params: TaskProviderFetchProjectsParams): Promise<ExternalProject[]> {
    const { accessToken, externalWorkspaceId } = params;
    if (!externalWorkspaceId) {
      throw new BadGatewayException('Jira integration requires externalWorkspaceId (site ID)');
    }

    const url = `https://${externalWorkspaceId}.atlassian.net/rest/api/3/project?maxResults=100`;
    const projects = await jiraFetch<JiraProject[]>(url, accessToken);

    return projects.map((p) => ({
      id: p.key,
      name: p.name,
      key: p.key,
    }));
  }
}
