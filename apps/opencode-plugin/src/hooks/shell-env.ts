import { TANDEMU_HOME, TANDEMU_STATE, readConfig } from "../lib/config.ts";

export function shellEnv(
  _input: { cwd: string; sessionID?: string; callID?: string },
  output: { env: Record<string, string> },
): void {
  output.env.TANDEMU_HOME = TANDEMU_HOME;
  output.env.TANDEMU_STATE = TANDEMU_STATE;

  const config = readConfig();
  if (!config) return;

  output.env.TANDEMU_TOKEN = config.auth.token;
  output.env.TANDEMU_API = config.api.url;
  output.env.TANDEMU_ORG_ID = config.organization.id;
  output.env.TANDEMU_USER_ID = config.user.id;
  output.env.TANDEMU_USER_EMAIL = config.user.email;
  output.env.TANDEMU_USER_NAME = config.user.name;

  const teams = config.teams ?? [];
  if (teams.length > 0) {
    output.env.TANDEMU_TEAM_ID = teams[0].id;
    output.env.TANDEMU_TEAM_IDS = teams.map((t) => t.id).join(",");
    output.env.TANDEMU_TEAM_NAMES = teams.map((t) => t.name).join(",");
    output.env.TANDEMU_TEAM_COUNT = String(teams.length);
  } else {
    output.env.TANDEMU_TEAM_COUNT = "0";
  }
}
