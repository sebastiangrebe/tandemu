import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type TandemuConfig = {
  auth: { token: string };
  api: { url: string };
  organization: { id: string; name?: string };
  user: { id: string; email: string; name: string };
  teams?: Array<{ id: string; name: string }>;
};

export const TANDEMU_HOME =
  process.env.TANDEMU_HOME ?? join(homedir(), ".config", "tandemu");

export const TANDEMU_STATE =
  process.env.TANDEMU_STATE ?? join(homedir(), ".local", "state", "tandemu");

export const OPENCODE_AGENTS_MD =
  process.env.OPENCODE_AGENTS_MD ??
  join(homedir(), ".config", "opencode", "AGENTS.md");

export function readConfig(): TandemuConfig | null {
  try {
    const raw = readFileSync(join(TANDEMU_HOME, "auth.json"), "utf8");
    return JSON.parse(raw) as TandemuConfig;
  } catch {
    return null;
  }
}
