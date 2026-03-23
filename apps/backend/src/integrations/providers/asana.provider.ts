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

const ASANA_API = 'https://app.asana.com/api/1.0';

function mapStatus(sectionName: string, completed: boolean): TaskStatus {
  if (completed) return 'done';
  const lower = sectionName.toLowerCase();
  if (lower.includes('done') || lower.includes('complete')) return 'done';
  if (lower.includes('in progress') || lower.includes('doing') || lower.includes('in development')) return 'in_progress';
  if (lower.includes('review') || lower.includes('in review') || lower.includes('code review')) return 'in_review';
  if (lower.includes('cancel') || lower.includes('archived')) return 'cancelled';
  return 'todo';
}

function mapPriority(customFields: AsanaCustomField[]): TaskPriority {
  const priorityField = customFields.find(
    (f) => f.name.toLowerCase() === 'priority' && f.enum_value,
  );
  if (!priorityField?.enum_value) return 'none';
  const lower = priorityField.enum_value.name.toLowerCase();
  if (lower.includes('urgent') || lower.includes('critical')) return 'urgent';
  if (lower.includes('high')) return 'high';
  if (lower.includes('medium')) return 'medium';
  if (lower.includes('low')) return 'low';
  return 'none';
}

async function asanaFetch<T>(path: string, token: string, method = 'GET', body?: unknown): Promise<T> {
  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${ASANA_API}${path}`, options);

  if (!response.ok) {
    if (response.status === 429) {
      throw new HttpException(
        'Asana API rate limit exceeded. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const text = await response.text();
    throw new BadGatewayException(`Asana API error (${response.status}): ${text}`);
  }

  const json = await response.json() as Record<string, unknown>;
  return json.data as T;
}

interface AsanaMembership {
  project: { gid: string; name: string };
  section: { gid: string; name: string };
}

interface AsanaCustomField {
  name: string;
  enum_value: { name: string } | null;
}

interface AsanaTask {
  gid: string;
  name: string;
  notes: string;
  completed: boolean;
  assignee: { gid: string; name: string; email: string } | null;
  memberships: AsanaMembership[];
  custom_fields: AsanaCustomField[];
  tags: Array<{ name: string }>;
  modified_at: string;
  permalink_url: string;
}

interface AsanaSection {
  gid: string;
  name: string;
}

function getSectionName(task: AsanaTask, externalProjectId: string): string {
  const membership = task.memberships.find((m) => m.project.gid === externalProjectId);
  return membership?.section?.name ?? '';
}

function mapTask(task: AsanaTask, externalProjectId: string): Task {
  const sectionName = getSectionName(task, externalProjectId);
  return {
    id: task.gid,
    title: task.name,
    description: task.notes || undefined,
    status: mapStatus(sectionName, task.completed),
    priority: mapPriority(task.custom_fields ?? []),
    assigneeName: task.assignee?.name,
    assigneeEmail: task.assignee?.email,
    labels: (task.tags ?? []).map((t) => t.name),
    sprint: sectionName || undefined,
    url: task.permalink_url,
    provider: 'asana',
    externalProjectId,
    updatedAt: task.modified_at,
  };
}

const TASK_OPT_FIELDS = 'gid,name,notes,completed,assignee,assignee.email,assignee.name,memberships.project.gid,memberships.project.name,memberships.section.gid,memberships.section.name,custom_fields,tags.name,modified_at,permalink_url';

export class AsanaProvider implements TaskProvider {
  async fetchTasks(params: TaskProviderFetchParams): Promise<Task[]> {
    const { accessToken, externalProjectId, assigneeEmail } = params;

    // Fetch incomplete tasks
    let tasks = await asanaFetch<AsanaTask[]>(
      `/projects/${externalProjectId}/tasks?opt_fields=${TASK_OPT_FIELDS}&completed_since=now&limit=100`,
      accessToken,
    );

    // Also fetch recently completed tasks (last 7 days) for standup
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    try {
      const completedTasks = await asanaFetch<AsanaTask[]>(
        `/projects/${externalProjectId}/tasks?opt_fields=${TASK_OPT_FIELDS}&completed_since=${sevenDaysAgo}&limit=100`,
        accessToken,
      );
      // completed_since returns tasks completed after that date, plus incomplete tasks.
      // Filter to only completed ones we don't already have.
      const incompleteGids = new Set(tasks.map((t) => t.gid));
      const newCompleted = completedTasks.filter((t) => t.completed && !incompleteGids.has(t.gid));
      tasks = [...tasks, ...newCompleted];
    } catch {
      // Non-critical — incomplete tasks are enough
    }

    if (assigneeEmail) {
      tasks = tasks.filter((t) => t.assignee?.email === assigneeEmail);
    }

    return tasks.map((task) => mapTask(task, externalProjectId));
  }

  async getTaskStatuses(params: { accessToken: string; taskId: string; config: Record<string, unknown> }): Promise<ProviderStatus[]> {
    const { accessToken, taskId } = params;

    // Get task to find which project it belongs to
    const task = await asanaFetch<{ gid: string; memberships: AsanaMembership[] }>(
      `/tasks/${taskId}?opt_fields=memberships.project.gid,memberships.section.gid,memberships.section.name`,
      accessToken,
    );

    const projectGid = task.memberships[0]?.project?.gid;
    if (!projectGid) {
      throw new BadGatewayException('Could not determine Asana project for this task');
    }

    // Fetch all sections in the project
    const sections = await asanaFetch<AsanaSection[]>(
      `/projects/${projectGid}/sections?opt_fields=gid,name`,
      accessToken,
    );

    return sections.map((s) => ({
      id: s.gid,
      name: s.name,
    }));
  }

  async updateTask(params: TaskProviderUpdateParams): Promise<void> {
    const { accessToken, taskId, statusName, assigneeEmail } = params;

    if (statusName) {
      const statuses = await this.getTaskStatuses({ accessToken, taskId, config: {} });
      const targetSection = statuses.find((s) => s.name === statusName);
      if (targetSection) {
        await asanaFetch(`/sections/${targetSection.id}/addTask`, accessToken, 'POST', { task: taskId });

        const isDone = mapStatus(statusName, false) === 'done';
        const isTodo = mapStatus(statusName, false) === 'todo';
        if (isDone) {
          await asanaFetch(`/tasks/${taskId}`, accessToken, 'PUT', { completed: true });
        } else if (isTodo) {
          await asanaFetch(`/tasks/${taskId}`, accessToken, 'PUT', { completed: false });
        }
      }
    }

    if (assigneeEmail) {
      // Asana uses user GIDs — look up by email via workspace users
      const workspaceRes = await asanaFetch<{ data: Array<{ gid: string }> }>(
        `/tasks/${taskId}`,
        accessToken,
        'GET',
      ) as Record<string, unknown>;
      const taskData = workspaceRes as { data?: { workspace?: { gid?: string } } };
      const workspaceGid = taskData?.data?.workspace?.gid;
      if (workspaceGid) {
        const usersRes = await asanaFetch<{ data: Array<{ gid: string; email: string }> }>(
          `/workspaces/${workspaceGid}/users?opt_fields=email`,
          accessToken,
          'GET',
        ) as { data?: Array<{ gid: string; email: string }> };
        const user = usersRes?.data?.find((u) => u.email === assigneeEmail);
        if (user) {
          await asanaFetch(`/tasks/${taskId}`, accessToken, 'PUT', { assignee: user.gid });
        }
      }
    }
  }

  async fetchProjects(params: TaskProviderFetchProjectsParams): Promise<ExternalProject[]> {
    const { accessToken, externalWorkspaceId } = params;
    if (!externalWorkspaceId) {
      throw new BadGatewayException('Asana integration requires a workspace GID');
    }

    const projects = await asanaFetch<Array<{ gid: string; name: string }>>(
      `/workspaces/${externalWorkspaceId}/projects?opt_fields=gid,name&limit=100`,
      accessToken,
    );

    return projects.map((p) => ({
      id: p.gid,
      name: p.name,
    }));
  }
}
