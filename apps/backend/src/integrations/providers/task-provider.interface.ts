import type { Task } from '@tandem/types';

export interface TaskProviderFetchParams {
  accessToken: string;
  externalProjectId: string;
  assigneeEmail?: string;
  sprint?: string;  // "current" or sprint name
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

export interface TaskProvider {
  fetchTasks(params: TaskProviderFetchParams): Promise<Task[]>;
  fetchProjects(params: TaskProviderFetchProjectsParams): Promise<ExternalProject[]>;
}
