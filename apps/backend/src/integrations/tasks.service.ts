import { Injectable, NotFoundException } from '@nestjs/common';
import type { Task, TaskStatus, IntegrationProvider } from '@tandemu/types';
import { IntegrationsService } from './integrations.service.js';
import { getProvider } from './providers/index.js';
import type { ExternalProject } from './providers/index.js';

export interface GetTasksParams {
  teamId?: string;
  assigneeEmail?: string;
  assigneeEmails?: string[];
  sprint?: string;
  excludeDone?: boolean;
  includeSubtasks?: boolean;
}

@Injectable()
export class TasksService {
  constructor(private readonly integrationsService: IntegrationsService) {}

  async getTasks(orgId: string, params: GetTasksParams): Promise<Task[]> {
    // Get all integrations for this org (findAll already returns full rows)
    const integrations = await this.integrationsService.findAll(orgId);

    if (integrations.length === 0) {
      return [];
    }

    // Fetch raw integrations + mappings in parallel (one findOne per integration, not N+1)
    const integrationData = await Promise.all(
      integrations.map(async (integration) => {
        const rawIntegration = await this.integrationsService.findOne(orgId, integration.provider);
        const mappings = await this.integrationsService.getMappings(rawIntegration.id);
        return { rawIntegration, mappings, provider: getProvider(integration.provider) };
      }),
    );

    // Build all fetch promises in parallel
    const fetchPromises: Promise<Task[]>[] = [];

    for (const { rawIntegration, mappings, provider } of integrationData) {
      const targetMappings = params.teamId
        ? mappings.filter((m) => m.teamId === params.teamId)
        : mappings;

      for (const mapping of targetMappings) {
        fetchPromises.push(
          provider.fetchTasks({
            accessToken: rawIntegration.access_token,
            externalProjectId: mapping.externalProjectId,
            assigneeEmail: params.assigneeEmail,
            assigneeEmails: params.assigneeEmails,
            sprint: params.sprint,
            excludeDone: params.excludeDone,
            config: { ...rawIntegration.config, ...mapping.config },
          }),
        );
      }
    }

    const results = await Promise.all(fetchPromises);
    const all = results.flat();

    // Filter out subtasks from the top-level list unless explicitly requested
    if (params.includeSubtasks) {
      return all;
    }
    return all.filter((t) => !t.parentId);
  }

  async getSubtasks(orgId: string, taskId: string, provider: IntegrationProvider): Promise<Task[]> {
    const integration = await this.integrationsService.findOne(orgId, provider);
    const taskProvider = getProvider(provider);

    if (!taskProvider.fetchSubtasks) {
      return [];
    }

    const subtasks = await taskProvider.fetchSubtasks({
      accessToken: integration.access_token,
      taskId,
      config: integration.config,
    });

    return subtasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  }

  async getTaskStatuses(orgId: string, taskId: string, provider: IntegrationProvider) {
    const integration = await this.integrationsService.findOne(orgId, provider);
    const taskProvider = getProvider(provider);

    return taskProvider.getTaskStatuses({
      accessToken: integration.access_token,
      taskId,
      config: integration.config,
    });
  }

  async updateTask(
    orgId: string,
    taskId: string,
    provider: IntegrationProvider,
    updates: { statusName?: string; assigneeEmail?: string; priority?: string; description?: string },
  ): Promise<void> {
    const integration = await this.integrationsService.findOne(orgId, provider);
    const taskProvider = getProvider(provider);

    await taskProvider.updateTask({
      accessToken: integration.access_token,
      taskId,
      statusName: updates.statusName,
      assigneeEmail: updates.assigneeEmail,
      priority: updates.priority,
      description: updates.description,
      config: integration.config,
    });
  }

  async createTask(
    orgId: string,
    params: { teamId: string; title: string; description?: string; assigneeEmail?: string; priority?: string; labels?: string[]; provider?: IntegrationProvider },
  ): Promise<Task> {
    const integrations = await this.integrationsService.findAll(orgId);
    if (integrations.length === 0) {
      throw new NotFoundException('No integrations configured for this organization');
    }

    // Fetch raw integrations + mappings in parallel
    const integrationData = await Promise.all(
      integrations.map(async (integration) => {
        const rawIntegration = await this.integrationsService.findOne(orgId, integration.provider);
        const mappings = await this.integrationsService.getMappings(rawIntegration.id);
        return { rawIntegration, mappings, provider: getProvider(integration.provider), providerName: integration.provider };
      }),
    );

    // If a specific provider was requested, try it first
    // Otherwise sort GitHub last so dedicated project trackers take priority
    const sorted = params.provider
      ? integrationData.sort((a, b) => (a.providerName === params.provider ? -1 : b.providerName === params.provider ? 1 : 0))
      : integrationData.sort((a, b) => (a.providerName === 'github' ? 1 : b.providerName === 'github' ? -1 : 0));

    for (const { rawIntegration, mappings, provider } of sorted) {
      const mapping = mappings.find((m) => m.teamId === params.teamId);
      if (!mapping) continue;

      return provider.createTask({
        accessToken: rawIntegration.access_token,
        externalProjectId: mapping.externalProjectId,
        title: params.title,
        description: params.description,
        assigneeEmail: params.assigneeEmail,
        priority: params.priority,
        labels: params.labels,
        config: { ...rawIntegration.config, ...mapping.config },
      });
    }

    throw new NotFoundException('No project mapping found for this team');
  }

  async getProjects(orgId: string, providerName: IntegrationProvider): Promise<ExternalProject[]> {
    const integration = await this.integrationsService.findOne(orgId, providerName);
    const provider = getProvider(providerName);

    return provider.fetchProjects({
      accessToken: integration.access_token,
      externalWorkspaceId: integration.external_workspace_id ?? undefined,
    });
  }
}
