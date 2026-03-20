import type { IntegrationProvider } from '@tandem/types';
import type { TaskProvider } from './task-provider.interface.js';
import { GitHubProvider } from './github.provider.js';
import { JiraProvider } from './jira.provider.js';
import { LinearProvider } from './linear.provider.js';
import { ClickUpProvider } from './clickup.provider.js';

const providers: Record<IntegrationProvider, TaskProvider> = {
  github: new GitHubProvider(),
  jira: new JiraProvider(),
  linear: new LinearProvider(),
  clickup: new ClickUpProvider(),
};

export function getProvider(provider: IntegrationProvider): TaskProvider {
  return providers[provider];
}

export type { TaskProvider, ExternalProject } from './task-provider.interface.js';
