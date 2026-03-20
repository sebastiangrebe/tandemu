import {
  BadGatewayException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Task, TaskStatus, TaskPriority } from '@tandem/types';
import type {
  TaskProvider,
  TaskProviderFetchParams,
  TaskProviderFetchProjectsParams,
  ExternalProject,
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

export class ClickUpProvider implements TaskProvider {
  async fetchTasks(params: TaskProviderFetchParams): Promise<Task[]> {
    const { accessToken, externalProjectId, assigneeEmail } = params;
    // externalProjectId is the ClickUp list ID
    let url = `${CLICKUP_API}/list/${externalProjectId}/task?include_closed=true&subtasks=true`;

    if (assigneeEmail) {
      // ClickUp filters by assignee via user IDs; we fetch all then filter client-side
    }

    const data = await clickupFetch<ClickUpTasksResponse>(url, accessToken);

    let tasks = data.tasks;
    if (assigneeEmail) {
      tasks = tasks.filter((t) =>
        t.assignees.some((a) => a.email === assigneeEmail),
      );
    }

    return tasks.map((task): Task => ({
      id: task.id,
      title: task.name,
      description: task.description ?? undefined,
      status: mapStatus(task.status.status),
      priority: mapPriority(task.priority ? parseInt(task.priority.id, 10) : null),
      assigneeName: task.assignees[0]?.username,
      assigneeEmail: task.assignees[0]?.email,
      labels: task.tags.map((t) => t.name),
      sprint: undefined,
      url: task.url,
      provider: 'clickup',
      externalProjectId,
      updatedAt: new Date(parseInt(task.date_updated, 10)).toISOString(),
    }));
  }

  async fetchProjects(params: TaskProviderFetchProjectsParams): Promise<ExternalProject[]> {
    const { accessToken, externalWorkspaceId } = params;
    if (!externalWorkspaceId) {
      throw new BadGatewayException('ClickUp integration requires externalWorkspaceId (team ID)');
    }

    // Get spaces first, then lists from each space
    const spacesData = await clickupFetch<{ spaces: Array<{ id: string; name: string }> }>(
      `${CLICKUP_API}/team/${externalWorkspaceId}/space?archived=false`,
      accessToken,
    );

    const projects: ExternalProject[] = [];

    for (const space of spacesData.spaces) {
      // Get folders and their lists
      const foldersData = await clickupFetch<ClickUpFoldersResponse>(
        `${CLICKUP_API}/space/${space.id}/folder?archived=false`,
        accessToken,
      );

      for (const folder of foldersData.folders) {
        for (const list of folder.lists) {
          projects.push({
            id: list.id,
            name: `${space.name} / ${folder.name} / ${list.name}`,
          });
        }
      }

      // Get folderless lists
      const listsData = await clickupFetch<ClickUpFolderlessListsResponse>(
        `${CLICKUP_API}/space/${space.id}/list?archived=false`,
        accessToken,
      );

      for (const list of listsData.lists) {
        projects.push({
          id: list.id,
          name: `${space.name} / ${list.name}`,
        });
      }
    }

    return projects;
  }
}
