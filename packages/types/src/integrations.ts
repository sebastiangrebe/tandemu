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
  readonly category?: TaskCategory;
}

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';
export type TaskCategory = 'bugfix' | 'feature' | 'tech_debt' | 'maintenance' | 'other';

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

// ── Standup ──

export interface StandupResponse {
  readonly team: { id: string; name: string; memberCount: number };
  readonly summary: {
    inProgress: number;
    inReview: number;
    doneThisWeek: number;
    todoCount: number;
  };
  readonly members: StandupMember[];
  readonly otherContributors: Array<{
    assigneeName?: string;
    assigneeEmail?: string;
    tasks: Task[];
  }>;
  readonly unassigned: Task[];
  readonly backlog: { tasks: Task[]; totalCount: number };
  readonly blockers: StandupBlocker[];
}

export interface StandupMember {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly tasks: {
    inProgress: Task[];
    inReview: Task[];
    recentlyDone: Task[];
  };
  readonly telemetry: {
    activeMinutes: number;
    sessions: number;
    aiLines: number;
    manualLines: number;
    frictionFiles: Array<{ path: string; count: number }>;
  };
}

export interface StandupBlocker {
  readonly type: 'stalled_review' | 'high_friction';
  readonly taskId?: string;
  readonly title?: string;
  readonly stalledDays?: number;
  readonly filePath?: string;
  readonly frictionCount?: number;
  readonly affectedDevs?: number;
}
