import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { TandemuConfig } from "./config.ts";
import { OPENCODE_AGENTS_MD } from "./config.ts";

const START = "<!-- tandemu:personality:start -->";
const END = "<!-- tandemu:personality:end -->";

export async function injectPersonality(
  config: TandemuConfig,
): Promise<void> {
  const url = new URL(
    `${config.api.url.replace(/\/$/, "")}/api/memory/search`,
  );
  url.searchParams.set(
    "q",
    "communication style preferences name personality coding DNA",
  );
  url.searchParams.set("scope", "personal");
  url.searchParams.set("limit", "5");

  let lines: string[] = [];
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${config.auth.token}` },
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      memories?: Array<{ memory?: string; content?: string }>;
    };
    lines = (data.memories ?? [])
      .map((m) => m.memory ?? m.content ?? "")
      .filter(Boolean)
      .map((s) => `- ${s}`);
  } catch {
    return;
  }

  const newBlock = lines.length
    ? `${START}\n# About This Developer\n${lines.join("\n")}\n${END}`
    : "";

  let existing = "";
  try {
    existing = readFileSync(OPENCODE_AGENTS_MD, "utf8");
  } catch {
    // file does not exist yet
  }

  let updated: string;
  const re = new RegExp(
    `${escapeRe(START)}[\\s\\S]*?${escapeRe(END)}`,
    "m",
  );
  if (re.test(existing)) {
    updated = existing.replace(re, newBlock);
    if (!newBlock) updated = updated.replace(/\n{3,}/g, "\n\n");
  } else if (newBlock) {
    updated = existing ? `${newBlock}\n\n${existing}` : `${newBlock}\n`;
  } else {
    return;
  }

  mkdirSync(dirname(OPENCODE_AGENTS_MD), { recursive: true });
  writeFileSync(OPENCODE_AGENTS_MD, updated);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
