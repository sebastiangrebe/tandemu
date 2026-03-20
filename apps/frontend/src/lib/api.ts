import type {
  AIvsManualRatio,
  FrictionEvent,
  DORAMetrics,
  Organization,
  Membership,
  Team,
  TeamMember,
  Invite,
} from "@tandem/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("tandem_token");
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
      localStorage.removeItem("tandem_token");
      window.location.href = "/login";
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || "Invalid credentials");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `API error: ${res.status} ${res.statusText}`);
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

export async function getAIRatio(): Promise<AIvsManualRatio[]> {
  return fetchApi<AIvsManualRatio[]>("/api/telemetry/ai-ratio");
}

export async function getFrictionHeatmap(): Promise<FrictionEvent[]> {
  return fetchApi<FrictionEvent[]>("/api/telemetry/friction-heatmap");
}

export async function getDORAMetrics(): Promise<DORAMetrics> {
  return fetchApi<DORAMetrics>("/api/telemetry/dora-metrics");
}

export interface TimesheetEntry {
  date: string;
  userId: string;
  userName: string;
  activeMinutes: number;
  sessions: number;
}

export async function getTimesheets(): Promise<TimesheetEntry[]> {
  return fetchApi<TimesheetEntry[]>("/api/telemetry/timesheets");
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

export async function updateTeam(orgId: string, teamId: string, data: { name?: string; description?: string }): Promise<Team> {
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

export async function createInvite(orgId: string, data: { email: string; role: string }): Promise<Invite> {
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

export async function createProjectMapping(
  provider: string,
  data: { teamId: string; externalProjectId: string; externalProjectName?: string }
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
}): Promise<Task[]> {
  const searchParams = new URLSearchParams();
  if (params?.teamId) searchParams.set("teamId", params.teamId);
  if (params?.sprint) searchParams.set("sprint", params.sprint);
  const qs = searchParams.toString();
  return fetchApi<Task[]>(`/api/tasks${qs ? `?${qs}` : ""}`);
}
