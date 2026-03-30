import type { TaskCategory } from '@tandemu/types';

const CATEGORY_RULES: Array<{ keywords: string[]; category: TaskCategory }> = [
  { keywords: ['bug', 'fix', 'hotfix', 'defect', 'regression', 'broken', 'crash', 'error', 'incident', 'patch'], category: 'bugfix' },
  { keywords: ['feature', 'enhancement', 'improvement', 'story', 'epic', 'user story', 'new', 'add', 'implement', 'mvp', 'prototype'], category: 'feature' },
  { keywords: ['debt', 'refactor', 'chore', 'cleanup', 'clean up', 'migrate', 'migration', 'deprecate', 'upgrade', 'tech debt', 'rework'], category: 'tech_debt' },
  { keywords: ['maintenance', 'ops', 'infra', 'ci', 'cd', 'pipeline', 'deploy', 'monitor', 'alert', 'config', 'devops', 'tooling', 'docs', 'documentation'], category: 'maintenance' },
];

export function inferCategory(labels: string[]): TaskCategory {
  const normalized = labels.map((l) => l.toLowerCase());
  for (const rule of CATEGORY_RULES) {
    if (normalized.some((label) => rule.keywords.some((kw) => label.includes(kw)))) {
      return rule.category;
    }
  }
  return 'other';
}
