import type { TaskCategory } from '@tandemu/types';

const CATEGORY_RULES: Array<{ keywords: string[]; category: TaskCategory }> = [
  { keywords: ['bug', 'fix', 'hotfix'], category: 'bugfix' },
  { keywords: ['feature', 'enhancement'], category: 'feature' },
  { keywords: ['debt', 'refactor', 'chore'], category: 'tech_debt' },
  { keywords: ['maintenance', 'ops', 'infra'], category: 'maintenance' },
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
