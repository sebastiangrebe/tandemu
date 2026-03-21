import type { IntegrationProvider } from '@tandem/types';
import type { TaskProvider } from './task-provider.interface.js';
import { GitHubProvider } from './github.provider.js';
import { JiraProvider } from './jira.provider.js';
import { LinearProvider } from './linear.provider.js';
import { ClickUpProvider } from './clickup.provider.js';
import { AsanaProvider } from './asana.provider.js';
import { MondayProvider } from './monday.provider.js';

const providers: Record<IntegrationProvider, TaskProvider> = {
  github: new GitHubProvider(),
  jira: new JiraProvider(),
  linear: new LinearProvider(),
  clickup: new ClickUpProvider(),
  asana: new AsanaProvider(),
  monday: new MondayProvider(),
};

export function getProvider(provider: IntegrationProvider): TaskProvider {
  return providers[provider];
}

export type { TaskProvider, ExternalProject } from './task-provider.interface.js';
