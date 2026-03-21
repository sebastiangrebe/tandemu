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
  TaskProviderUpdateStatusParams,
  ExternalProject,
  ProviderStatus,
} from './task-provider.interface.js';

const LINEAR_API = 'https://api.linear.app/graphql';

function mapStatus(stateName: string): TaskStatus {
  const lower = stateName.toLowerCase();
  if (lower === 'done' || lower === 'completed') return 'done';
  if (lower === 'in progress' || lower === 'started') return 'in_progress';
  if (lower === 'in review') return 'in_review';
  if (lower === 'cancelled' || lower === 'canceled') return 'cancelled';
  if (lower === 'todo' || lower === 'backlog' || lower === 'triage' || lower === 'unstarted') return 'todo';
  return 'todo';
}

function mapPriority(priority: number): TaskPriority {
  switch (priority) {
    case 0: return 'none';
    case 1: return 'urgent';
    case 2: return 'high';
    case 3: return 'medium';
    case 4: return 'low';
    default: return 'none';
  }
}

async function linearFetch<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new HttpException(
        'Linear API rate limit exceeded. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const body = await response.text();
    throw new BadGatewayException(
      `Linear API error (${response.status}): ${body}`,
    );
  }

  const json = await response.json() as { data: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new BadGatewayException(
      `Linear GraphQL error: ${json.errors.map((e) => e.message).join(', ')}`,
    );
  }

  return json.data;
}

interface LinearIssueNode {
  identifier: string;
  title: string;
  description: string | null;
  state: { name: string };
  priority: number;
  assignee: { name: string; email: string } | null;
  labels: { nodes: Array<{ name: string }> };
  cycle: { name: string | null; number: number } | null;
  url: string;
  updatedAt: string;
}

interface LinearIssuesResponse {
  issues: {
    nodes: LinearIssueNode[];
  };
}

interface LinearProjectNode {
  id: string;
  name: string;
  key: string;
}

interface LinearTeamsResponse {
  teams: {
    nodes: LinearProjectNode[];
  };
}

export class LinearProvider implements TaskProvider {
  async fetchTasks(params: TaskProviderFetchParams): Promise<Task[]> {
    const { accessToken, externalProjectId, assigneeEmail } = params;

    // externalProjectId is the Linear team ID
    const filters: string[] = [`team: { id: { eq: "${externalProjectId}" } }`];
    if (assigneeEmail) {
      filters.push(`assignee: { email: { eq: "${assigneeEmail}" } }`);
    }

    const query = `
      query {
        issues(
          filter: { ${filters.join(', ')} }
          first: 100
          orderBy: updatedAt
        ) {
          nodes {
            identifier
            title
            description
            state { name }
            priority
            assignee { name email }
            labels { nodes { name } }
            cycle { name number }
            url
            updatedAt
          }
        }
      }
    `;

    const data = await linearFetch<LinearIssuesResponse>(accessToken, query);

    return data.issues.nodes.map((issue): Task => ({
      id: issue.identifier,
      title: issue.title,
      description: issue.description ?? undefined,
      status: mapStatus(issue.state.name),
      priority: mapPriority(issue.priority),
      assigneeName: issue.assignee?.name,
      assigneeEmail: issue.assignee?.email,
      labels: issue.labels.nodes.map((l) => l.name),
      sprint: issue.cycle
        ? issue.cycle.name ?? `Cycle ${issue.cycle.number}`
        : undefined,
      url: issue.url,
      provider: 'linear',
      externalProjectId,
      updatedAt: issue.updatedAt,
    }));
  }

  private async findIssueByIdentifier(accessToken: string, identifier: string) {
    // Parse "SGS-18" into team key "SGS" and number 18
    const match = identifier.match(/^([A-Z]+)-(\d+)$/);
    if (!match) return null;

    const [, teamKey, numberStr] = match;
    const number = parseInt(numberStr, 10);

    const data = await linearFetch<{
      issues: {
        nodes: Array<{
          id: string;
          team: { states: { nodes: Array<{ id: string; name: string; type: string }> } };
        }>;
      };
    }>(accessToken, `
      query {
        issues(filter: { number: { eq: ${number} }, team: { key: { eq: "${teamKey}" } } }, first: 1) {
          nodes {
            id
            team {
              states { nodes { id name type } }
            }
          }
        }
      }
    `);

    return data.issues.nodes[0] ?? null;
  }

  async getTaskStatuses(params: { accessToken: string; taskId: string; config: Record<string, unknown> }): Promise<ProviderStatus[]> {
    const { accessToken, taskId } = params;

    const issue = await this.findIssueByIdentifier(accessToken, taskId);
    if (!issue) return [];

    return issue.team.states.nodes.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
    }));
  }

  async updateTaskStatus(params: TaskProviderUpdateStatusParams): Promise<void> {
    const { accessToken, taskId, statusName } = params;

    const issue = await this.findIssueByIdentifier(accessToken, taskId);
    if (!issue) return;

    const target = issue.team.states.nodes.find(
      (s) => s.name.toLowerCase() === statusName.toLowerCase(),
    );
    if (!target) return;

    await linearFetch<{ issueUpdate: { success: boolean } }>(
      accessToken,
      `mutation { issueUpdate(id: "${issue.id}", input: { stateId: "${target.id}" }) { success } }`,
    );
  }

  async fetchProjects(params: TaskProviderFetchProjectsParams): Promise<ExternalProject[]> {
    const { accessToken } = params;

    const query = `
      query {
        teams(first: 100) {
          nodes {
            id
            name
            key
          }
        }
      }
    `;

    const data = await linearFetch<LinearTeamsResponse>(accessToken, query);

    return data.teams.nodes.map((team) => ({
      id: team.id,
      name: team.name,
      key: team.key,
    }));
  }
}
