import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Task, TaskStatus, TaskPriority } from '@tandemu/types';
import type {
  TaskProvider,
  TaskProviderFetchParams,
  TaskProviderFetchProjectsParams,
  TaskProviderFetchSubtasksParams,
  TaskProviderUpdateParams,
  TaskProviderCreateParams,
  ExternalProject,
  ProviderStatus,
} from './task-provider.interface.js';

const CLICKUP_API = 'https://api.clickup.com/api/v2';

function mapStatus(statusName: string): TaskStatus {
  const lower = statusName.toLowerCase();
  if (lower === 'complete' || lower === 'done' || lower === 'closed') return 'done';
  if (lower === 'in progress' || lower === 'doing') return 'in_progress';
  if (lower === 'in review' || lower === 'review') return 'in_review';
  if (lower === 'cancelled' || lower === 'rejected') return 'cancelled';
  return 'todo';
}

function mapPriority(priority: number | null): TaskPriority {
  switch (priority) {
    case 1: return 'urgent';
    case 2: return 'high';
    case 3: return 'medium';
    case 4: return 'low';
    default: return 'none';
  }
}

async function clickupFetch<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new HttpException(
        'ClickUp API rate limit exceeded. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const body = await response.text();
    throw new BadGatewayException(
      `ClickUp API error (${response.status}): ${body}`,
    );
  }

  return response.json() as Promise<T>;
}

interface ClickUpTask {
  id: string;
  name: string;
  description: string | null;
  status: { status: string };
  priority: { id: string } | null;
  assignees: Array<{ username: string; email: string }>;
  tags: Array<{ name: string }>;
  url: string;
  date_updated: string;
  list: { id: string; name: string };
  sprint_id?: string;
  parent?: string | null;
}

interface ClickUpTasksResponse {
  tasks: ClickUpTask[];
}

interface ClickUpFolder {
  id: string;
  name: string;
  lists: Array<{ id: string; name: string }>;
}

interface ClickUpFoldersResponse {
  folders: ClickUpFolder[];
}

interface ClickUpFolderlessListsResponse {
  lists: Array<{ id: string; name: string }>;
}

function mapTask(task: ClickUpTask, externalProjectId: string): Task {
  return {
    id: task.id,
    title: task.name,
    description: task.description ?? undefined,
    status: mapStatus(task.status?.status ?? 'todo'),
    priority: mapPriority(task.priority ? parseInt(task.priority.id, 10) : null),
    assigneeName: task.assignees?.[0]?.username,
    assigneeEmail: task.assignees?.[0]?.email,
    labels: (task.tags ?? []).map((t) => t.name),
    sprint: task.list?.name,
    url: task.url,
    provider: 'clickup',
    externalProjectId,
    updatedAt: task.date_updated ? new Date(parseInt(task.date_updated, 10)).toISOString() : new Date().toISOString(),
    parentId: task.parent ?? undefined,
  };
}

function enrichSubtaskCounts(tasks: Task[]): Task[] {
  const childCounts = new Map<string, number>();
  for (const t of tasks) {
    if (t.parentId) {
      childCounts.set(t.parentId, (childCounts.get(t.parentId) ?? 0) + 1);
    }
  }
  return tasks.map((t) => ({
    ...t,
    hasSubtasks: (childCounts.get(t.id) ?? 0) > 0,
    subtaskCount: childCounts.get(t.id) ?? 0,
  }));
}

const logger = new Logger('ClickUpProvider');

export class ClickUpProvider implements TaskProvider {
  async fetchTasks(params: TaskProviderFetchParams): Promise<Task[]> {
    const { accessToken, externalProjectId, assigneeEmail, assigneeEmails, excludeDone, config } = params;
    const emails = assigneeEmails ?? (assigneeEmail ? [assigneeEmail] : []);

    let allTasks: ClickUpTask[] = [];
    const includeClosed = excludeDone ? 'false' : 'true';
    const subProjectId = config?.subProjectId as string | undefined;

    if (subProjectId) {
      // A specific list was selected — fetch only from that list
      const listData = await clickupFetch<ClickUpTasksResponse>(
        `${CLICKUP_API}/list/${subProjectId}/task?include_closed=${includeClosed}&subtasks=true`,
        accessToken,
      );
      allTasks = listData.tasks;
    } else {
      // externalProjectId can be a folder ID (preferred) or a list ID.
      // Try as folder first — fetch all lists in the folder and aggregate tasks.
      // If that fails (404), fall back to treating it as a list ID.
      try {
        const folderData = await clickupFetch<ClickUpFolder>(
          `${CLICKUP_API}/folder/${externalProjectId}`,
          accessToken,
        );
        for (const list of folderData.lists) {
          const listData = await clickupFetch<ClickUpTasksResponse>(
            `${CLICKUP_API}/list/${list.id}/task?include_closed=${includeClosed}&subtasks=true`,
            accessToken,
          );
          allTasks.push(...listData.tasks);
        }
      } catch (err) {
        logger.warn(`ClickUp folder fetch failed for ${externalProjectId}, retrying as list: ${err}`);
        Sentry.captureException(err, { tags: { operation: 'provider-clickup-folder-fallback' }, extra: { externalProjectId } });
        const listData = await clickupFetch<ClickUpTasksResponse>(
          `${CLICKUP_API}/list/${externalProjectId}/task?include_closed=${includeClosed}&subtasks=true`,
          accessToken,
        );
        allTasks = listData.tasks;
      }
    }

    if (emails.length > 0) {
      allTasks = allTasks.filter((t) =>
        t.assignees.some((a) => emails.includes(a.email)),
      );
    }

    const mapped = allTasks.map((task) => mapTask(task, externalProjectId));
    return enrichSubtaskCounts(mapped);
  }

  async getTaskStatuses(params: { accessToken: string; taskId: string; config: Record<string, unknown> }): Promise<ProviderStatus[]> {
    const { accessToken, taskId } = params;

    const task = await clickupFetch<{ id: string; list: { id: string } }>(
      `${CLICKUP_API}/task/${taskId}`,
      accessToken,
    );

    const list = await clickupFetch<{
      statuses: Array<{ status: string; type: string; orderindex: number }>;
    }>(`${CLICKUP_API}/list/${task.list.id}`, accessToken);

    return list.statuses.map((s) => ({
      id: s.status,
      name: s.status,
      type: s.type,
    }));
  }

  async updateTask(params: TaskProviderUpdateParams): Promise<void> {
    const { accessToken, taskId, statusName, assigneeEmail, priority, description } = params;

    const body: Record<string, unknown> = {};
    if (statusName) body.status = statusName;
    if (description) body.description = description;
    if (priority) {
      const prioMap: Record<string, number> = { urgent: 1, high: 2, medium: 3, low: 4 };
      const prioNum = prioMap[priority.toLowerCase()];
      if (prioNum) body.priority = prioNum;
    }
    // ClickUp uses user IDs for assignees — look up by email via team members
    // For now, assignment requires the ClickUp user ID which we don't have from email alone
    // Status update works directly

    if (Object.keys(body).length === 0 && !assigneeEmail) return;

    const response = await fetch(`${CLICKUP_API}/task/${taskId}`, {
      method: 'PUT',
      headers: {
        Authorization: accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new BadGatewayException(`ClickUp task update failed (${response.status}): ${text}`);
    }
  }

  async createTask(params: TaskProviderCreateParams): Promise<Task> {
    const { accessToken, externalProjectId, title, description, priority, config } = params;

    // If a specific list was selected as sub-project, use it directly.
    // Otherwise, resolve: folder → first list, or use as list ID directly.
    let listId = (config?.subProjectId as string) || externalProjectId;
    if (!config?.subProjectId) {
      try {
        const folder = await clickupFetch<ClickUpFolder>(`${CLICKUP_API}/folder/${externalProjectId}`, accessToken);
        if (folder.lists.length > 0) listId = folder.lists[0]!.id;
      } catch {
        // Not a folder — use as list ID directly
      }
    }

    const body: Record<string, unknown> = { name: title };
    if (description) body.description = description;
    if (priority) {
      const prioMap: Record<string, number> = { urgent: 1, high: 2, medium: 3, low: 4 };
      if (prioMap[priority.toLowerCase()]) body.priority = prioMap[priority.toLowerCase()];
    }

    const res = await fetch(`${CLICKUP_API}/list/${listId}/task`, {
      method: 'POST',
      headers: { Authorization: accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new BadGatewayException(`ClickUp create task failed (${res.status}): ${text}`);
    }
    const task = (await res.json()) as ClickUpTask;
    return mapTask(task, externalProjectId);
  }

  async fetchSubtasks(params: TaskProviderFetchSubtasksParams): Promise<Task[]> {
    const { accessToken, taskId } = params;

    const task = await clickupFetch<ClickUpTask & { subtasks?: ClickUpTask[] }>(
      `${CLICKUP_API}/task/${taskId}?include_subtasks=true`,
      accessToken,
    );

    const subtasks = task.subtasks ?? [];
    // Use the parent task's list as the externalProjectId context
    const externalProjectId = task.list.id;
    const mapped = subtasks.map((st) => mapTask(st, externalProjectId));
    return enrichSubtaskCounts(mapped);
  }

  async fetchProjects(params: TaskProviderFetchProjectsParams): Promise<ExternalProject[]> {
    const { accessToken, externalWorkspaceId } = params;

    // Auto-fetch workspace ID if not provided
    let workspaceId = externalWorkspaceId;
    if (!workspaceId) {
      const teamsData = await clickupFetch<{ teams: Array<{ id: string; name: string }> }>(
        `${CLICKUP_API}/team`,
        accessToken,
      );
      if (teamsData.teams.length === 0) {
        throw new BadGatewayException('No ClickUp workspaces found for this token');
      }
      workspaceId = teamsData.teams[0]!.id;
    }

    const spacesData = await clickupFetch<{ spaces: Array<{ id: string; name: string }> }>(
      `${CLICKUP_API}/team/${workspaceId}/space?archived=false`,
      accessToken,
    );

    const projects: ExternalProject[] = [];

    for (const space of spacesData.spaces) {
      // Return folders as the primary mappable entities (a folder = a team's board)
      const foldersData = await clickupFetch<ClickUpFoldersResponse>(
        `${CLICKUP_API}/space/${space.id}/folder?archived=false`,
        accessToken,
      );

      for (const folder of foldersData.folders) {
        projects.push({
          id: folder.id,
          name: `${space.name} / ${folder.name}`,
          key: `${folder.lists.length} lists`,
        });
      }

      // Also include folderless lists for simple setups (single-list boards)
      const listsData = await clickupFetch<ClickUpFolderlessListsResponse>(
        `${CLICKUP_API}/space/${space.id}/list?archived=false`,
        accessToken,
      );

      for (const list of listsData.lists) {
        projects.push({
          id: list.id,
          name: `${space.name} / ${list.name}`,
          key: 'list',
        });
      }
    }

    return projects;
  }

  async fetchSubProjects(accessToken: string, folderId: string): Promise<ExternalProject[]> {
    try {
      const folder = await clickupFetch<ClickUpFolder>(
        `${CLICKUP_API}/folder/${folderId}`,
        accessToken,
      );
      return folder.lists.map((list) => ({
        id: list.id,
        name: list.name,
      }));
    } catch (err) {
      logger.warn(`Failed to fetch ClickUp sub-projects for folder ${folderId}: ${err}`);
      Sentry.captureException(err, { tags: { operation: 'provider-clickup-sub-projects' }, extra: { folderId } });
      return [];
    }
  }
}
