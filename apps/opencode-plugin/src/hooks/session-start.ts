import type { createOpencodeClient } from "@opencode-ai/sdk";
import { readConfig } from "../lib/config.ts";
import { injectPersonality } from "../lib/memory-bootstrap.ts";

type Client = ReturnType<typeof createOpencodeClient>;

async function safeLog(client: Client | undefined, msg: string): Promise<void> {
  if (!client) return;
  try {
    const fn = (client as { app?: { log?: (msg: string) => unknown } }).app?.log;
    if (typeof fn === "function") await fn(msg);
  } catch {
    // logging best-effort
  }
}

export function sessionStart(client: Client | undefined) {
  return async (_event: unknown): Promise<void> => {
    const config = readConfig();
    if (!config) {
      await safeLog(client, "[tandemu] not configured — run install.sh or /tandemu:setup");
      return;
    }
    try {
      await injectPersonality(config);
    } catch (err) {
      await safeLog(client, `[tandemu] personality sync failed: ${(err as Error).message}`);
    }
  };
}
