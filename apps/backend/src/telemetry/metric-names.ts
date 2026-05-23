// NOTE: Codex CLI emits cost only as derived (input_token_count + output_token_count
// on `codex.sse_event` × server-side price table). It does NOT emit a native
// USD cost metric, so cost queries should still treat it as missing here and
// compute server-side. Token counts ARE first-class.
export const COST_METRICS = [
  'claude_code.cost.usage',
  'opencode.cost.usage',
] as const;

export const TOKEN_METRICS = [
  'claude_code.token.usage',
  'opencode.token.usage',
  // Codex CLI uses log events (`codex.sse_event` with token-count attributes)
  // rather than a top-level metric; ingest handles it separately.
] as const;

export const LINES_METRICS = [
  'claude_code.lines_of_code.count',
  'opencode.lines_of_code.count',
  'tandemu.lines_of_code',
] as const;

export const TOOL_METRICS = [
  'claude_code.tool.usage',
  'opencode.tool.usage',
  'codex.tool_result',
] as const;

export const TANDEMU_SERVICE_NAMES = ['claude-code', 'opencode', 'codex'] as const;

export function sqlIn(values: readonly string[]): string {
  if (values.length === 0) throw new Error('sqlIn: empty list');
  return `(${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(',')})`;
}
