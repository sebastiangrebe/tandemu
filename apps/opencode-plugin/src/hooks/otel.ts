import type { Event, AssistantMessage } from "@opencode-ai/sdk";
import type { PluginInput } from "@opencode-ai/plugin";

type BunShell = PluginInput["$"];
import { readConfig } from "../lib/config.ts";
import { record, flush } from "../lib/otlp.ts";

const seenMessages = new Set<string>();

// Per-call start timestamps, keyed by callID, written by recordToolStart
// (tool.execute.before) and consumed by recordToolUse (tool.execute.after).
// Lets us emit duration_ms per tool call instead of just an aggregate counter.
const toolStarts = new Map<string, number>();

export function recordToolStart(input: { tool: string; callID: string }): void {
  toolStarts.set(input.callID, Date.now());
}

export function recordToolUse(input: {
  tool: string;
  callID?: string;
  output?: { output?: string; metadata?: unknown };
}): void {
  const startedAt = input.callID ? toolStarts.get(input.callID) : undefined;
  const durationMs = startedAt ? Date.now() - startedAt : 0;
  if (input.callID) toolStarts.delete(input.callID);

  // Best-effort success detection from output / metadata. OpenCode doesn't
  // expose a structured success flag, so we look for error markers and fall
  // back to "true" otherwise. Worth keeping coarse rather than missing — the
  // friction-heatmap reads success=false, so we want to surface failures.
  const success = detectSuccess(input.output);

  record("opencode.tool.usage", 1, {
    tool: input.tool,
    success: success ? "true" : "false",
    ...(durationMs > 0 ? { duration_ms: durationMs } : {}),
  });

  if (durationMs > 0) {
    record("opencode.tool.duration_ms", durationMs, {
      tool: input.tool,
      success: success ? "true" : "false",
    });
  }
}

function detectSuccess(output: { output?: string; metadata?: unknown } | undefined): boolean {
  if (!output) return true;
  const md = output.metadata as Record<string, unknown> | undefined;
  if (md && typeof md === "object") {
    if (md.error || md.success === false) return false;
  }
  const text = output.output ?? "";
  if (typeof text === "string" && text.length > 0) {
    // Heuristic: bash failure prints "exit code N" / "Error:" / "command failed"
    if (/\bexit code\s+[1-9]/i.test(text)) return false;
    if (/^\s*Error:/m.test(text)) return false;
    if (/\bcommand failed\b/i.test(text)) return false;
  }
  return true;
}

export function recordMessage(message: AssistantMessage): void {
  if (seenMessages.has(message.id)) return;
  seenMessages.add(message.id);

  const model = message.modelID;
  const provider = message.providerID;

  if (typeof message.cost === "number" && message.cost > 0) {
    record("opencode.cost.usage", message.cost, { model, provider });
  }

  const t = message.tokens;
  if (t) {
    if (t.input) record("opencode.token.usage", t.input, { type: "input", model });
    if (t.output) record("opencode.token.usage", t.output, { type: "output", model });
    if (t.reasoning) record("opencode.token.usage", t.reasoning, { type: "reasoning", model });
    if (t.cache?.read) record("opencode.token.usage", t.cache.read, { type: "cacheRead", model });
    if (t.cache?.write) record("opencode.token.usage", t.cache.write, { type: "cacheWrite", model });
  }
}

export async function flushSession($: BunShell | undefined): Promise<void> {
  const config = readConfig();
  if (!config) return;

  if ($) {
    try {
      const numstat = await $`git diff --numstat HEAD~10..HEAD`.text();
      for (const line of numstat.split("\n")) {
        const [add, del] = line.trim().split(/\s+/);
        const a = Number(add);
        const d = Number(del);
        if (Number.isFinite(a) && a > 0) {
          record("opencode.lines_of_code.count", a, { type: "added" });
        }
        if (Number.isFinite(d) && d > 0) {
          record("opencode.lines_of_code.count", d, { type: "removed" });
        }
      }
    } catch {
      // not a git repo or git unavailable
    }
  }

  const endpoint =
    process.env.TANDEMU_OTEL_ENDPOINT ??
    `${config.api.url.replace(/\/$/, "")}/api/telemetry/ingest`;

  await flush(config, endpoint).catch(() => {});
}

export async function dispatchEvent(
  event: Event,
  $: BunShell | undefined,
  onSessionCreated: () => Promise<void>,
): Promise<void> {
  switch (event.type) {
    case "session.created":
      await onSessionCreated();
      return;
    case "message.updated":
      if (event.properties.info.role === "assistant") {
        recordMessage(event.properties.info);
      }
      return;
    case "session.idle":
    case "session.compacted":
      await flushSession($);
      return;
    default:
      return;
  }
}
