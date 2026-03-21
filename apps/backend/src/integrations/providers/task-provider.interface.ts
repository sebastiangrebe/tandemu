import type { Task, TaskStatus } from '@tandemu/types';

export interface TaskProviderFetchParams {
  accessToken: string;
  externalProjectId: string;
  assigneeEmail?: string;
  sprint?: string;  // "current" or sprint name
  config: Record<string, unknown>;
}

export interface TaskProviderUpdateStatusParams {
  accessToken: string;
  taskId: string;  // external task ID (e.g., "SGS-11", "TAND-42")
  statusName: string;  // exact status name from the provider (e.g., "In Progress", "Doing", "Shipped")
  config: Record<string, unknown>;
}

export interface ExternalProject {
  id: string;
  name: string;
  key?: string;
}

export interface TaskProviderFetchProjectsParams {
  accessToken: string;
  externalWorkspaceId?: string;
}

export interface ProviderStatus {
  id: string;
  name: string;
  type?: string;  // provider-specific category (e.g., ClickUp: "open"/"done"/"closed", Linear: workflow state type)
}

export interface TaskProvider {
  fetchTasks(params: TaskProviderFetchParams): Promise<Task[]>;
  fetchProjects(params: TaskProviderFetchProjectsParams): Promise<ExternalProject[]>;
  getTaskStatuses(params: { accessToken: string; taskId: string; config: Record<string, unknown> }): Promise<ProviderStatus[]>;
  updateTaskStatus(params: TaskProviderUpdateStatusParams): Promise<void>;
}
