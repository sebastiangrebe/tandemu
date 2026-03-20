import { Injectable, NotFoundException } from '@nestjs/common';
import type { Task, IntegrationProvider } from '@tandem/types';
import { IntegrationsService } from './integrations.service.js';
import { getProvider } from './providers/index.js';
import type { ExternalProject } from './providers/index.js';

export interface GetTasksParams {
  teamId?: string;
  assigneeEmail?: string;
  sprint?: string;
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
          sprint: params.sprint,
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
            sprint: params.sprint,
            config: { ...rawIntegration.config, ...mapping.config },
          });
          allTasks.push(...tasks);
        }
      }
    }

    return allTasks;
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
