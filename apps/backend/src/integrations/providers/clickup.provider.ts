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
    status: mapStatus(task.status.status),
    priority: mapPriority(task.priority ? parseInt(task.priority.id, 10) : null),
    assigneeName: task.assignees[0]?.username,
    assigneeEmail: task.assignees[0]?.email,
    labels: task.tags.map((t) => t.name),
    sprint: task.list.name,
    url: task.url,
    provider: 'clickup',
    externalProjectId,
    updatedAt: new Date(parseInt(task.date_updated, 10)).toISOString(),
  };
}

export class ClickUpProvider implements TaskProvider {
  async fetchTasks(params: TaskProviderFetchParams): Promise<Task[]> {
    const { accessToken, externalProjectId, assigneeEmail } = params;

    // externalProjectId can be a folder ID (preferred) or a list ID.
    // Try as folder first — fetch all lists in the folder and aggregate tasks.
    // If that fails (404), fall back to treating it as a list ID.
    let allTasks: ClickUpTask[] = [];

    try {
      const folderData = await clickupFetch<ClickUpFolder>(
        `${CLICKUP_API}/folder/${externalProjectId}`,
        accessToken,
      );
      // It's a folder — fetch tasks from every list in it
      for (const list of folderData.lists) {
        const listData = await clickupFetch<ClickUpTasksResponse>(
          `${CLICKUP_API}/list/${list.id}/task?include_closed=true&subtasks=true`,
          accessToken,
        );
        allTasks.push(...listData.tasks);
      }
    } catch (err) {
      // Not a folder — try as a list ID
      const listData = await clickupFetch<ClickUpTasksResponse>(
        `${CLICKUP_API}/list/${externalProjectId}/task?include_closed=true&subtasks=true`,
        accessToken,
      );
      allTasks = listData.tasks;
    }

    if (assigneeEmail) {
      allTasks = allTasks.filter((t) =>
        t.assignees.some((a) => a.email === assigneeEmail),
      );
    }

    return allTasks.map((task) => mapTask(task, externalProjectId));
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
    const { accessToken, taskId, statusName, assigneeEmail } = params;

    const body: Record<string, unknown> = {};
    if (statusName) body.status = statusName;
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

  async fetchProjects(params: TaskProviderFetchProjectsParams): Promise<ExternalProject[]> {
    const { accessToken, externalWorkspaceId } = params;
    if (!externalWorkspaceId) {
      throw new BadGatewayException('ClickUp integration requires externalWorkspaceId (team ID)');
    }

    const spacesData = await clickupFetch<{ spaces: Array<{ id: string; name: string }> }>(
      `${CLICKUP_API}/team/${externalWorkspaceId}/space?archived=false`,
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
}
