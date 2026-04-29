import type { Plugin } from "@opencode-ai/plugin";
import { sessionStart } from "./hooks/session-start.ts";
import { dispatchEvent, recordToolUse } from "./hooks/otel.ts";
import { shellEnv } from "./hooks/shell-env.ts";

export const TandemuPlugin: Plugin = async ({ client, $ }) => {
  const onSessionCreated = sessionStart(client);

  return {
    event: async ({ event }) => {
      await dispatchEvent(event, $, () => onSessionCreated(event));
    },
    "tool.execute.after": async (input) => {
      recordToolUse({ tool: input.tool });
    },
    "shell.env": async (input, output) => {
      shellEnv(input, output);
    },
  };
};

export default TandemuPlugin;
