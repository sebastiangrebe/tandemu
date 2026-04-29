export const COST_METRICS = [
  'claude_code.cost.usage',
  'opencode.cost.usage',
] as const;

export const TOKEN_METRICS = [
  'claude_code.token.usage',
  'opencode.token.usage',
] as const;

export const LINES_METRICS = [
  'claude_code.lines_of_code.count',
  'opencode.lines_of_code.count',
  'tandemu.lines_of_code',
] as const;

export const TOOL_METRICS = [
  'claude_code.tool.usage',
  'opencode.tool.usage',
] as const;

export const TANDEMU_SERVICE_NAMES = ['claude-code', 'opencode'] as const;

export function sqlIn(values: readonly string[]): string {
  if (values.length === 0) throw new Error('sqlIn: empty list');
  return `(${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(',')})`;
}
