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
  TaskProviderFetchSubtasksParams,
  TaskProviderSearchParams,
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
  parent?: { identifier: string } | null;
  children?: { nodes: Array<{ identifier: string }> };
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
    const { accessToken, externalProjectId, assigneeEmail, assigneeEmails, excludeDone, config } = params;
    const emails = assigneeEmails ?? (assigneeEmail ? [assigneeEmail] : []);

    // externalProjectId is the Linear team ID
    const filters: string[] = [`team: { id: { eq: "${externalProjectId}" } }`];
    const subProjectId = config?.subProjectId as string | undefined;
    if (subProjectId) {
      filters.push(`project: { id: { eq: "${subProjectId}" } }`);
    }
    if (emails.length === 1) {
      filters.push(`assignee: { email: { eq: "${emails[0]}" } }`);
    } else if (emails.length > 1) {
      filters.push(`assignee: { email: { in: [${emails.map((e) => `"${e}"`).join(', ')}] } }`);
    }
    if (excludeDone) {
      filters.push(`state: { type: { nin: ["completed", "canceled"] } }`);
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
            parent { identifier }
            children { nodes { identifier } }
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
      parentId: issue.parent?.identifier ?? undefined,
      hasSubtasks: (issue.children?.nodes?.length ?? 0) > 0,
      subtaskCount: issue.children?.nodes?.length ?? 0,
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

  async updateTask(params: TaskProviderUpdateParams): Promise<void> {
    const { accessToken, taskId, statusName, assigneeEmail, priority, description } = params;

    const issue = await this.findIssueByIdentifier(accessToken, taskId);
    if (!issue) return;

    // Build a single mutation input with all requested changes
    const input: Record<string, string | number> = {};

    if (description) input.description = description;

    if (priority) {
      const prioMap: Record<string, number> = { urgent: 1, high: 2, medium: 3, low: 4, none: 0 };
      const prioNum = prioMap[priority.toLowerCase()];
      if (prioNum !== undefined) input.priority = prioNum;
    }

    if (statusName) {
      const target = issue.team.states.nodes.find(
        (s) => s.name.toLowerCase() === statusName.toLowerCase(),
      );
      if (target) input.stateId = target.id;
    }

    if (assigneeEmail) {
      const userData = await linearFetch<{ users: { nodes: Array<{ id: string }> } }>(
        accessToken,
        `query ($email: String!) { users(filter: { email: { eq: $email } }) { nodes { id } } }`,
        { email: assigneeEmail },
      );
      const userId = userData.users.nodes[0]?.id;
      if (userId) input.assigneeId = userId;
    }

    if (Object.keys(input).length === 0) return;

    await linearFetch<{ issueUpdate: { success: boolean } }>(
      accessToken,
      `mutation ($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`,
      { id: issue.id, input },
    );
  }

  async createTask(params: TaskProviderCreateParams): Promise<Task> {
    const { accessToken, externalProjectId, title, description, assigneeEmail, priority, config } = params;

    const inputObj: Record<string, unknown> = {
      teamId: externalProjectId,
      title,
    };
    if (description) inputObj.description = description;

    // If the mapping config has a sub-project ID (Linear project), assign the issue to it
    const subProjectId = config?.subProjectId as string | undefined;
    if (subProjectId) inputObj.projectId = subProjectId;

    if (assigneeEmail) {
      const userData = await linearFetch<{ users: { nodes: Array<{ id: string }> } }>(
        accessToken,
        `query ($email: String!) { users(filter: { email: { eq: $email } }) { nodes { id } } }`,
        { email: assigneeEmail },
      );
      const userId = userData.users.nodes[0]?.id;
      if (userId) inputObj.assigneeId = userId;
    }

    if (priority) {
      const prioMap: Record<string, number> = { urgent: 1, high: 2, medium: 3, low: 4, none: 0 };
      const prioNum = prioMap[priority.toLowerCase()];
      if (prioNum !== undefined) inputObj.priority = prioNum;
    }

    const data = await linearFetch<{
      issueCreate: {
        success: boolean;
        issue: {
          identifier: string;
          title: string;
          description: string | null;
          state: { name: string };
          priority: number;
          assignee: { name: string; email: string } | null;
          labels: { nodes: Array<{ name: string }> };
          url: string;
          updatedAt: string;
        };
      };
    }>(
      accessToken,
      `mutation ($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { identifier title description state { name } priority assignee { name email } labels { nodes { name } } url updatedAt } } }`,
      { input: inputObj },
    );

    const issue = data.issueCreate.issue;
    return {
      id: issue.identifier,
      title: issue.title,
      description: issue.description ?? undefined,
      status: mapStatus(issue.state.name),
      priority: mapPriority(issue.priority),
      assigneeName: issue.assignee?.name,
      assigneeEmail: issue.assignee?.email,
      labels: issue.labels.nodes.map((l) => l.name),
      url: issue.url,
      provider: 'linear',
      externalProjectId,
      updatedAt: issue.updatedAt,
    };
  }

  async searchTasks(params: TaskProviderSearchParams): Promise<Task[]> {
    const { accessToken, query, externalProjectId, limit = 20 } = params;

    // Linear's `searchIssues(term:)` returns ranked free-text results. The
    // public schema doesn't expose a server-side team filter on this query,
    // so we over-fetch and post-filter when externalProjectId (team id) is set.
    const fetchSize = externalProjectId ? Math.min(limit * 4, 100) : limit;

    const data = await linearFetch<{
      searchIssues: { nodes: Array<LinearIssueNode & { team: { id: string } }> };
    }>(accessToken, `
      query Search($term: String!, $first: Int!) {
        searchIssues(term: $term, first: $first) {
          nodes {
            identifier
            title
            description
            state { name }
            priority
            assignee { name email }
            labels { nodes { name } }
            cycle { name number }
            parent { identifier }
            children { nodes { identifier } }
            team { id }
            url
            updatedAt
          }
        }
      }
    `, { term: query, first: fetchSize });

    const all = data.searchIssues.nodes;
    const filtered = externalProjectId
      ? all.filter((issue) => issue.team.id === externalProjectId)
      : all;

    return filtered.slice(0, limit).map((issue): Task => ({
      id: issue.identifier,
      title: issue.title,
      description: issue.description ?? undefined,
      status: mapStatus(issue.state.name),
      priority: mapPriority(issue.priority),
      assigneeName: issue.assignee?.name,
      assigneeEmail: issue.assignee?.email,
      labels: issue.labels.nodes.map((l) => l.name),
      sprint: issue.cycle ? issue.cycle.name ?? `Cycle ${issue.cycle.number}` : undefined,
      url: issue.url,
      provider: 'linear',
      externalProjectId: issue.team.id,
      updatedAt: issue.updatedAt,
      parentId: issue.parent?.identifier ?? undefined,
      hasSubtasks: (issue.children?.nodes?.length ?? 0) > 0,
      subtaskCount: issue.children?.nodes?.length ?? 0,
    }));
  }

  async fetchSubtasks(params: TaskProviderFetchSubtasksParams): Promise<Task[]> {
    const { accessToken, taskId } = params;

    const match = taskId.match(/^([A-Z]+)-(\d+)$/);
    if (!match) return [];

    const [, teamKey, numberStr] = match;
    const number = parseInt(numberStr, 10);

    const data = await linearFetch<{
      issues: {
        nodes: Array<{
          children: {
            nodes: LinearIssueNode[];
          };
          team: { id: string };
        }>;
      };
    }>(accessToken, `
      query {
        issues(filter: { number: { eq: ${number} }, team: { key: { eq: "${teamKey}" } } }, first: 1) {
          nodes {
            team { id }
            children {
              nodes {
                identifier
                title
                description
                state { name }
                priority
                assignee { name email }
                labels { nodes { name } }
                cycle { name number }
                parent { identifier }
                children { nodes { identifier } }
                url
                updatedAt
              }
            }
          }
        }
      }
    `);

    const parentIssue = data.issues.nodes[0];
    if (!parentIssue) return [];

    const externalProjectId = parentIssue.team.id;
    return parentIssue.children.nodes.map((issue): Task => ({
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
      parentId: issue.parent?.identifier ?? undefined,
      hasSubtasks: (issue.children?.nodes?.length ?? 0) > 0,
      subtaskCount: issue.children?.nodes?.length ?? 0,
    }));
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

  async fetchSubProjects(accessToken: string, teamId: string): Promise<ExternalProject[]> {
    const data = await linearFetch<{
      team: { projects: { nodes: Array<{ id: string; name: string }> } };
    }>(
      accessToken,
      `query ($teamId: String!) { team(id: $teamId) { projects(first: 50) { nodes { id name } } } }`,
      { teamId },
    );

    return data.team.projects.nodes.map((p) => ({
      id: p.id,
      name: p.name,
    }));
  }
}
