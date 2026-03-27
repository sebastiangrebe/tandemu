import type {
  AIvsManualRatio,
  FrictionEvent,
  Organization,
  Membership,
  Team,
  TeamMember,
  Invite,
} from "@tandemu/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("tandemu_token");
}

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });

  if (res.status === 401) {
    // Don't redirect on auth endpoints — let the caller handle the error
    const isAuthEndpoint = path.startsWith("/api/auth/login") || path.startsWith("/api/auth/register");
    if (!isAuthEndpoint && typeof window !== "undefined") {
      localStorage.removeItem("tandemu_token");
      window.location.href = "/login";
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || "Invalid credentials");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `API error: ${res.status} ${res.statusText}`);
  }

  // Handle 204 No Content or empty responses
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }

  const json = await res.json();

  // Backend wraps responses in { success, data } via TransformInterceptor
  if (json && typeof json === "object" && "success" in json && "data" in json) {
    if (!json.success) {
      throw new Error(json.error ?? "Unknown API error");
    }
    return json.data as T;
  }

  return json as T;
}

// ---- Auth Config ----

export interface AuthConfig {
  providers: string[];
}

export async function getAuthConfig(): Promise<AuthConfig> {
  return fetchApi<AuthConfig>('/api/auth/config');
}

// ---- Auth ----

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role?: string;
}

export async function apiLogin(email: string, password: string): Promise<AuthResponse> {
  return fetchApi<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function apiRegister(email: string, name: string, password: string): Promise<AuthResponse> {
  return fetchApi<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, name, password }),
  });
}

export async function switchOrg(organizationId: string): Promise<{ accessToken: string }> {
  return fetchApi<{ accessToken: string }>("/api/auth/switch-org", {
    method: "POST",
    body: JSON.stringify({ organizationId }),
  });
}

export async function getMe(): Promise<AuthUser> {
  const response = await fetchApi<{ user: AuthUser }>("/api/auth/me");
  return response.user;
}

// ---- Email aliases ----

export interface UserEmail {
  id: string;
  email: string;
  isPrimary: boolean;
  createdAt: string;
}

export async function getEmailAliases(): Promise<UserEmail[]> {
  return fetchApi<UserEmail[]>("/api/auth/emails");
}

export async function addEmailAlias(email: string): Promise<UserEmail> {
  return fetchApi<UserEmail>("/api/auth/emails", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function removeEmailAlias(emailId: string): Promise<void> {
  return fetchApi<void>(`/api/auth/emails/${emailId}`, {
    method: "DELETE",
  });
}

// ---- Organizations ----

export async function getOrganizations(): Promise<Organization[]> {
  return fetchApi<Organization[]>("/api/organizations");
}

export async function getOrganization(id: string): Promise<Organization> {
  return fetchApi<Organization>(`/api/organizations/${id}`);
}

export async function getMembers(orgId: string): Promise<Membership[]> {
  return fetchApi<Membership[]>(`/api/organizations/${orgId}/members`);
}

// ---- Telemetry ----

export interface TelemetryFilter {
  startDate?: string;
  endDate?: string;
}

function buildParams(filter?: TelemetryFilter): string {
  if (!filter) return '';
  const p = new URLSearchParams();
  if (filter.startDate) p.set('startDate', filter.startDate);
  if (filter.endDate) p.set('endDate', filter.endDate);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function getAIRatio(filter?: TelemetryFilter): Promise<AIvsManualRatio[]> {
  return fetchApi<AIvsManualRatio[]>(`/api/telemetry/ai-ratio${buildParams(filter)}`);
}

export async function getFrictionHeatmap(filter?: TelemetryFilter): Promise<FrictionEvent[]> {
  return fetchApi<FrictionEvent[]>(`/api/telemetry/friction-heatmap${buildParams(filter)}`);
}

export interface TimesheetEntry {
  date: string;
  userId: string;
  userName: string;
  activeMinutes: number;
  sessions: number;
}

export async function getTimesheets(filter?: TelemetryFilter): Promise<TimesheetEntry[]> {
  return fetchApi<TimesheetEntry[]>(`/api/telemetry/timesheets${buildParams(filter)}`);
}

export interface ToolUsageStat {
  toolName: string;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  avgDurationMs: number;
  successRate: number;
}

export async function getToolUsage(filter?: TelemetryFilter): Promise<ToolUsageStat[]> {
  return fetchApi<ToolUsageStat[]>(`/api/telemetry/tool-usage${buildParams(filter)}`);
}

export interface DeveloperStat {
  userId: string;
  userName: string;
  sessions: number;
  activeMinutes: number;
  aiLines: number;
  manualLines: number;
}

export async function getDeveloperStats(filter?: TelemetryFilter): Promise<DeveloperStat[]> {
  return fetchApi<DeveloperStat[]>(`/api/telemetry/developer-stats${buildParams(filter)}`);
}

export interface TaskVelocityEntry {
  week: string;
  avgDurationHours: number;
  taskCount: number;
}

export async function getTaskVelocity(filter?: TelemetryFilter): Promise<TaskVelocityEntry[]> {
  return fetchApi<TaskVelocityEntry[]>(`/api/telemetry/task-velocity${buildParams(filter)}`);
}

export interface HotFile {
  filePath: string;
  changeCount: number;
  taskCount: number;
  developerCount: number;
}

export async function getHotFiles(filter?: TelemetryFilter): Promise<HotFile[]> {
  return fetchApi<HotFile[]>(`/api/telemetry/hot-files${buildParams(filter)}`);
}

export interface InvestmentAllocation {
  category: string;
  taskCount: number;
  totalHours: number;
}

export async function getInvestmentAllocation(filter?: TelemetryFilter): Promise<InvestmentAllocation[]> {
  return fetchApi<InvestmentAllocation[]>(`/api/telemetry/investment-allocation${buildParams(filter)}`);
}

export interface AIEffectivenessEntry {
  filePath: string;
  aiTouchCount: number;
}

export async function getAIEffectiveness(filter?: TelemetryFilter): Promise<AIEffectivenessEntry[]> {
  return fetchApi<AIEffectivenessEntry[]>(`/api/telemetry/ai-effectiveness${buildParams(filter)}`);
}

export interface CostEntry {
  date: string;
  totalCost: number;
}

export async function getCostMetrics(filter?: TelemetryFilter): Promise<CostEntry[]> {
  return fetchApi<CostEntry[]>(`/api/telemetry/cost-metrics${buildParams(filter)}`);
}

export interface TokenUsageEntry {
  tokenType: string;
  model: string;
  totalTokens: number;
}

export async function getTokenUsage(filter?: TelemetryFilter): Promise<TokenUsageEntry[]> {
  return fetchApi<TokenUsageEntry[]>(`/api/telemetry/token-usage${buildParams(filter)}`);
}

// ---- Organizations (mutations) ----

export async function createOrganization(data: { name: string; slug: string }): Promise<Organization> {
  return fetchApi<Organization>("/api/organizations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateOrganization(orgId: string, data: { name?: string; slug?: string }): Promise<Organization> {
  return fetchApi<Organization>(`/api/organizations/${orgId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ---- Teams ----

export async function getTeams(orgId: string): Promise<Team[]> {
  return fetchApi<Team[]>(`/api/organizations/${orgId}/teams`);
}

export async function createTeam(orgId: string, data: { name: string; description?: string }): Promise<Team> {
  return fetchApi<Team>(`/api/organizations/${orgId}/teams`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateTeam(orgId: string, teamId: string, data: { name?: string; description?: string; settings?: { doneWindowDays?: number } }): Promise<Team> {
  return fetchApi<Team>(`/api/organizations/${orgId}/teams/${teamId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteTeam(orgId: string, teamId: string): Promise<void> {
  return fetchApi<void>(`/api/organizations/${orgId}/teams/${teamId}`, {
    method: "DELETE",
  });
}

export async function getTeamMembers(orgId: string, teamId: string): Promise<TeamMember[]> {
  return fetchApi<TeamMember[]>(`/api/organizations/${orgId}/teams/${teamId}/members`);
}

export async function addTeamMember(orgId: string, teamId: string, userId: string): Promise<void> {
  return fetchApi<void>(`/api/organizations/${orgId}/teams/${teamId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export async function removeTeamMember(orgId: string, teamId: string, userId: string): Promise<void> {
  return fetchApi<void>(`/api/organizations/${orgId}/teams/${teamId}/members/${userId}`, {
    method: "DELETE",
  });
}

// ---- Invites ----

export async function getInvites(orgId: string): Promise<Invite[]> {
  return fetchApi<Invite[]>(`/api/organizations/${orgId}/invites`);
}

export async function createInvite(orgId: string, data: { email: string; role: string; teamId?: string }): Promise<Invite> {
  return fetchApi<Invite>(`/api/organizations/${orgId}/invites`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function cancelInvite(orgId: string, inviteId: string): Promise<void> {
  return fetchApi<void>(`/api/organizations/${orgId}/invites/${inviteId}`, {
    method: "DELETE",
  });
}

// ---- CLI Auth ----

export async function authorizeCli(code: string): Promise<void> {
  return fetchApi<void>("/api/auth/cli/authorize", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

// ---- Integrations ----

export interface Integration {
  id: string;
  organizationId: string;
  provider: string;
  externalWorkspaceId?: string;
  externalWorkspaceName?: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationProjectMapping {
  id: string;
  integrationId: string;
  teamId: string;
  externalProjectId: string;
  externalProjectName?: string;
  config: Record<string, unknown>;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assigneeEmail?: string;
  assigneeName?: string;
  labels: string[];
  sprint?: string;
  url: string;
  provider: string;
  externalProjectId: string;
  updatedAt: string;
}

export async function getIntegrations(): Promise<Integration[]> {
  return fetchApi<Integration[]>("/api/integrations");
}

export async function createIntegration(data: {
  provider: string;
  accessToken: string;
  externalWorkspaceId?: string;
  externalWorkspaceName?: string;
}): Promise<Integration> {
  return fetchApi<Integration>("/api/integrations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteIntegration(provider: string): Promise<void> {
  return fetchApi<void>(`/api/integrations/${provider}`, {
    method: "DELETE",
  });
}

export async function getExternalProjects(
  provider: string
): Promise<Array<{ id: string; name: string; key?: string }>> {
  return fetchApi<Array<{ id: string; name: string; key?: string }>>(
    `/api/integrations/${provider}/projects`
  );
}

export async function getProjectMappings(
  provider: string
): Promise<IntegrationProjectMapping[]> {
  return fetchApi<IntegrationProjectMapping[]>(
    `/api/integrations/${provider}/mappings`
  );
}

export async function getSubProjects(
  provider: string,
  projectId: string,
): Promise<Array<{ id: string; name: string }>> {
  return fetchApi<Array<{ id: string; name: string }>>(
    `/api/integrations/${provider}/projects/${projectId}/sub-projects`
  );
}

export async function createProjectMapping(
  provider: string,
  data: { teamId: string; externalProjectId: string; externalProjectName?: string; config?: Record<string, unknown> }
): Promise<IntegrationProjectMapping> {
  return fetchApi<IntegrationProjectMapping>(
    `/api/integrations/${provider}/mappings`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
}

export async function deleteProjectMapping(
  provider: string,
  mappingId: string
): Promise<void> {
  return fetchApi<void>(`/api/integrations/${provider}/mappings/${mappingId}`, {
    method: "DELETE",
  });
}

export async function getTasks(params?: {
  teamId?: string;
  sprint?: string;
  sort?: 'priority' | 'updatedAt';
  order?: 'asc' | 'desc';
  excludeDone?: boolean;
}): Promise<Task[]> {
  const searchParams = new URLSearchParams();
  if (params?.teamId) searchParams.set("teamId", params.teamId);
  if (params?.sprint) searchParams.set("sprint", params.sprint);
  if (params?.sort) searchParams.set("sort", params.sort);
  if (params?.order) searchParams.set("order", params.order);
  if (params?.excludeDone) searchParams.set("excludeDone", "true");
  const qs = searchParams.toString();
  return fetchApi<Task[]>(`/api/tasks${qs ? `?${qs}` : ""}`);
}

// Billing (only functional when billing module is available in the backend)

export async function createCheckout(data: {
  organizationId: string;
  planTier: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ sessionId: string; url: string }> {
  return fetchApi<{ sessionId: string; url: string }>("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function createBillingPortal(data: {
  organizationId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  return fetchApi<{ url: string }>("/api/billing/portal", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ---- Memory ----

export type MemoryScope = 'personal' | 'org';

export interface MemoryMetadata {
  status?: 'draft' | 'published';
  author_id?: string;
  taskId?: string;
  repo?: string;
  files?: string[];
  category?: string;
  [key: string]: unknown;
}

export interface MemoryEntry {
  id: string;
  content: string;
  metadata: MemoryMetadata;
  createdAt: string;
  updatedAt: string;
  score?: number;
}

export interface MemoryListResponse {
  memories: MemoryEntry[];
  total: number;
}

export interface MemoryStatsResponse {
  personal: number;
  org: number;
  total: number;
  categories: Record<string, number>;
}

export async function getMemoryList(scope: MemoryScope, limit = 50, offset = 0): Promise<MemoryListResponse> {
  const params = new URLSearchParams({ scope, limit: String(limit), offset: String(offset) });
  return fetchApi<MemoryListResponse>(`/api/memory/list?${params}`);
}

export async function searchMemories(query: string, scope: MemoryScope | 'all' = 'all', limit = 20): Promise<{ memories: MemoryEntry[] }> {
  const params = new URLSearchParams({ q: query, scope, limit: String(limit) });
  return fetchApi<{ memories: MemoryEntry[] }>(`/api/memory/search?${params}`);
}

export async function updateMemory(memoryId: string, body: { content?: string; metadata?: Record<string, unknown> }): Promise<void> {
  return fetchApi<void>(`/api/memory/${memoryId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteMemory(memoryId: string): Promise<void> {
  return fetchApi<void>(`/api/memory/${memoryId}`, {
    method: "DELETE",
  });
}

export async function getMemoryStats(): Promise<MemoryStatsResponse> {
  return fetchApi<MemoryStatsResponse>("/api/memory/stats");
}

export async function approveMemory(memoryId: string): Promise<void> {
  return fetchApi<void>(`/api/memory/${memoryId}/approve`, {
    method: "POST",
  });
}
