export type IntegrationProvider = 'github' | 'jira' | 'linear' | 'clickup' | 'asana' | 'monday';

export interface Integration {
  readonly id: string;
  readonly organizationId: string;
  readonly provider: IntegrationProvider;
  readonly externalWorkspaceId?: string;
  readonly externalWorkspaceName?: string;
  readonly config: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IntegrationProjectMapping {
  readonly id: string;
  readonly integrationId: string;
  readonly teamId: string;
  readonly externalProjectId: string;
  readonly externalProjectName?: string;
  readonly config: Record<string, unknown>;
  readonly createdAt: string;
}

// Unified task interface — same shape regardless of provider
export interface Task {
  readonly id: string;              // external ID (e.g., "TAND-42", "123")
  readonly title: string;
  readonly description?: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly assigneeEmail?: string;
  readonly assigneeName?: string;
  readonly labels: string[];
  readonly sprint?: string;
  readonly url: string;             // link to the task in the external system
  readonly provider: IntegrationProvider;
  readonly externalProjectId: string;
  readonly updatedAt: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

export interface CreateIntegrationDto {
  readonly provider: IntegrationProvider;
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly externalWorkspaceId?: string;
  readonly externalWorkspaceName?: string;
}

export interface CreateProjectMappingDto {
  readonly teamId: string;
  readonly externalProjectId: string;
  readonly externalProjectName?: string;
  readonly config?: Record<string, unknown>;
}
