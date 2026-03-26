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
}

@Injectable()
export class TasksService {
  constructor(private readonly integrationsService: IntegrationsService) {}

  async getTasks(orgId: string, params: GetTasksParams): Promise<Task[]> {
    // Get all integrations for this org
    const integrations = await this.integrationsService.findAll(orgId);

    if (integrations.length === 0) {
      return [];
    }

    const allTasks: Task[] = [];

    for (const integration of integrations) {
      // Get the raw integration with access token
      const rawIntegration = await this.integrationsService.findOne(orgId, integration.provider);
      const provider = getProvider(integration.provider);

      if (params.teamId) {
        // Look up the project mapping for this team
        const mappings = await this.integrationsService.getMappings(rawIntegration.id);
        const mapping = mappings.find((m) => m.teamId === params.teamId);
        if (!mapping) {
          // No mapping for this team in this integration — skip
          continue;
        }

        const tasks = await provider.fetchTasks({
          accessToken: rawIntegration.access_token,
          externalProjectId: mapping.externalProjectId,
          assigneeEmail: params.assigneeEmail,
          assigneeEmails: params.assigneeEmails,
          sprint: params.sprint,
          excludeDone: params.excludeDone,
          config: { ...rawIntegration.config, ...mapping.config },
        });
        allTasks.push(...tasks);
      } else {
        // No team specified — fetch from all mapped projects
        const mappings = await this.integrationsService.getMappings(rawIntegration.id);
        for (const mapping of mappings) {
          const tasks = await provider.fetchTasks({
            accessToken: rawIntegration.access_token,
            externalProjectId: mapping.externalProjectId,
            assigneeEmail: params.assigneeEmail,
            assigneeEmails: params.assigneeEmails,
            sprint: params.sprint,
            config: { ...rawIntegration.config, ...mapping.config },
          });
          allTasks.push(...tasks);
        }
      }
    }

    return allTasks;
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
    updates: { statusName?: string; assigneeEmail?: string; priority?: string },
  ): Promise<void> {
    const integration = await this.integrationsService.findOne(orgId, provider);
    const taskProvider = getProvider(provider);

    await taskProvider.updateTask({
      accessToken: integration.access_token,
      taskId,
      statusName: updates.statusName,
      assigneeEmail: updates.assigneeEmail,
      priority: updates.priority,
      config: integration.config,
    });
  }

  async createTask(
    orgId: string,
    params: { teamId: string; title: string; description?: string; assigneeEmail?: string; priority?: string; labels?: string[] },
  ): Promise<Task> {
    const integrations = await this.integrationsService.findAll(orgId);
    if (integrations.length === 0) {
      throw new NotFoundException('No integrations configured for this organization');
    }

    for (const integration of integrations) {
      const rawIntegration = await this.integrationsService.findOne(orgId, integration.provider);
      const mappings = await this.integrationsService.getMappings(rawIntegration.id);
      const mapping = mappings.find((m) => m.teamId === params.teamId);
      if (!mapping) continue;

      const provider = getProvider(integration.provider);
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
