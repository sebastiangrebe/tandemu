# @tandemu/opencode-plugin

Tandemu AI Teammate plugin for [OpenCode](https://opencode.ai). Adds the same task lifecycle, telemetry, persistent memory, and personality system that Tandemu provides to Claude Code, but native to OpenCode.

## Install

```sh
# 1. Make sure you have a Tandemu account and configure auth:
./install.sh --target=opencode

# 2. Add the plugin to opencode.json (install.sh does this automatically):
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@tandemu/opencode-plugin"]
}
```

OpenCode auto-installs the plugin via Bun on startup.

## What it provides

- **Slash commands**: `/morning`, `/finish`, `/pause`, `/create`, `/standup`, `/setup`
- **Skills** at `~/.config/opencode/skills/` — same SKILL.md content as the Claude Code plugin
- **Personality**: `~/.config/opencode/AGENTS.md` is kept in sync with personality memories from the Tandemu API
- **Telemetry**: emits `opencode.cost.usage`, `opencode.token.usage`, `opencode.lines_of_code.count`, `opencode.tool.usage` via OTLP/HTTP to the Tandemu backend
- **Memory MCP**: configures `tandemu-memory` MCP server in `opencode.json` so the agent can search and store memories

## Hooks

| Event | What it does |
|---|---|
| `session.created` | Pulls personality memories from the API and updates the personality block in `AGENTS.md` |
| `session.idle` / `session.compacted` | Computes lines-of-code from `git diff --numstat` and flushes the OTLP buffer |
| `tool.execute.after` | Records `opencode.tool.usage` and `opencode.tool.duration` |
| `message.updated` | Records `opencode.cost.usage` and `opencode.token.usage` from the message's cost/token fields |
| `shell.env` | Injects `TANDEMU_TOKEN`, `TANDEMU_API`, etc. so skill bodies' curl commands authenticate without re-reading config |

## Config

Reads `~/.config/tandemu/auth.json` (written by `install.sh --target=opencode` or `/tandemu:setup`):

```json
{
  "auth": { "token": "..." },
  "api": { "url": "https://api.tandemu.dev" },
  "organization": { "id": "...", "name": "..." },
  "user": { "id": "...", "email": "...", "name": "..." },
  "teams": [{ "id": "...", "name": "..." }]
}
```

Override paths with env vars: `TANDEMU_HOME`, `TANDEMU_STATE`, `TANDEMU_OTEL_ENDPOINT`, `OPENCODE_AGENTS_MD`.

## Versioning

Version mirrors the Claude Code plugin (`apps/claude-plugins/.claude-plugin/plugin.json`). `pnpm release` bumps both.
