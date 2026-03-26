import type { Task, TaskStatus } from '@tandemu/types';

export interface TaskProviderFetchParams {
  accessToken: string;
  externalProjectId: string;
  assigneeEmail?: string;
  assigneeEmails?: string[];  // Multiple emails for alias matching
  sprint?: string;  // "current" or sprint name
  excludeDone?: boolean;
  config: Record<string, unknown>;
}

export interface TaskProviderUpdateParams {
  accessToken: string;
  taskId: string;
  statusName?: string;
  assigneeEmail?: string;
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

export interface TaskProviderCreateParams {
  accessToken: string;
  externalProjectId: string;
  title: string;
  description?: string;
  assigneeEmail?: string;
  priority?: string;
  labels?: string[];
  config: Record<string, unknown>;
}

export interface TaskProvider {
  fetchTasks(params: TaskProviderFetchParams): Promise<Task[]>;
  fetchProjects(params: TaskProviderFetchProjectsParams): Promise<ExternalProject[]>;
  getTaskStatuses(params: { accessToken: string; taskId: string; config: Record<string, unknown> }): Promise<ProviderStatus[]>;
  updateTask(params: TaskProviderUpdateParams): Promise<void>;
  createTask(params: TaskProviderCreateParams): Promise<Task>;
}
