# @tandemu/claude-plugins

Claude Code plugin for the Tandemu AI Teammate platform. Provides skills, hooks, configuration templates, and a shared library that extend Claude Code with Tandemu-specific workflows.

## Overview

The plugin system consists of five parts:

1. **CLAUDE.md** — The AI Teammate's "constitution" that defines behavior, memory usage, code style, and workflows
2. **Skills** — Markdown-defined workflows (`skills/<name>/SKILL.md`) that Claude Code executes as slash commands
3. **Hooks** — Shell scripts that run at specific lifecycle events
4. **Lib** — Shared shell utilities sourced by skills and hooks
5. **Config templates** — JSON configuration for connecting to the Tandemu platform and MCP memory server

## Skills

Skills are invoked as slash commands within a Claude Code session. Each skill lives in `skills/<name>/SKILL.md`.

| Skill | Command | Description |
|-------|---------|-------------|
| **setup** | `/tandemu:setup` | Authenticates with Tandemu, configures skills, MCP, hooks, and CLAUDE.md |
| **morning** | `/tandemu:morning` | Fetches assigned tasks, lets you pick one to start working on |
| **finish** | `/tandemu:finish` | Marks current task as done, measures work, sends telemetry |
| **pause** | `/tandemu:pause` | Pauses current task so you can switch to another |
| **create** | `/tandemu:create` | Creates a new task in the connected ticket system |
| **standup** | `/tandemu:standup` | Generates a team standup report from task and telemetry data |
| **blockers** | `/tandemu:blockers` | Surfaces team friction and blocked/stale tasks |

### Adding a new skill

Create a new directory in `skills/` with a `SKILL.md` file following the existing pattern:

1. Add frontmatter with the skill name and description
2. Write step-by-step instructions that Claude Code will follow
3. Include example commands and expected output formats

## Hooks

Hooks are shell scripts in `hooks/` that run at specific points in the development lifecycle.

| Hook | File | Trigger |
|------|------|---------|
| **pre-session** | `hooks/pre-session.sh` | Runs at session start. Loads CLAUDE.md, checks for config, sets up telemetry environment variables. |
| **post-commit** | `hooks/post-commit.sh` | Runs after each commit. Validates conventional commit format, attaches telemetry metadata via git notes. |
| **post-task** | `hooks/post-task.sh` | Runs after task completion. Generates a diff summary and suggested PR description. |

### Hook environment variables

Hooks may use the following environment variables:

| Variable | Description |
|----------|-------------|
| `TANDEMU_SESSION_ID` | Unique identifier for the current session |
| `TANDEMU_SESSION_START` | ISO 8601 timestamp of session start |
| `TANDEMU_TELEMETRY_ENABLED` | Whether telemetry is enabled (`true`/`false`) |
| `TANDEMU_TELEMETRY_ENDPOINT` | OpenTelemetry collector endpoint |
| `TANDEMU_ORG_ID` | Organization identifier |
| `TANDEMU_MAIN_BRANCH` | Main branch name (defaults to `main`) |

## Lib

Shared shell utilities in `lib/` sourced by skills and hooks at runtime.

| File | Purpose |
|------|---------|
| `lib/tandemu-env.sh` | Loads `TANDEMU_TOKEN` and `TANDEMU_API` from `~/.claude/tandemu.json` into the environment |

## Configuration

### Tandemu config

Copy `tandemu-config.example.json` to `.tandemu-config` in your repo root and fill in your organization details:

```bash
cp apps/claude-plugins/tandemu-config.example.json .tandemu-config
```

Key settings:

- **organization** — Your Tandemu org ID and name
- **telemetry** — OpenTelemetry endpoint and ingestion key
- **memory** — MCP memory mode (`local` or `remote`) and server path
- **plugins** — Which skills and hooks are active

### MCP config

Copy `mcp-config.example.json` to configure Claude Code's MCP server connection:

```bash
cp apps/claude-plugins/mcp-config.example.json .mcp.json
```

This connects Claude Code to the Tandemu MCP memory server, enabling persistent memory across sessions.

## Project Structure

```
apps/claude-plugins/
  .claude-plugin/
    plugin.json                # Plugin marketplace metadata (name, version)
  CLAUDE.md                    # AI Teammate constitution
  README.md                    # This file
  package.json                 # Package metadata
  tsconfig.json                # TypeScript config
  tandemu-config.example.json  # Tandemu platform config template
  mcp-config.example.json      # MCP server config template
  lib/
    tandemu-env.sh             # Shared env loader (TANDEMU_TOKEN, TANDEMU_API)
  skills/
    setup/SKILL.md             # Authentication and configuration
    morning/SKILL.md           # Task selection
    finish/SKILL.md            # Task completion and telemetry
    pause/SKILL.md             # Task pausing
    create/SKILL.md            # Task creation
    standup/SKILL.md           # Team standup report
    blockers/SKILL.md          # Friction and blockers
  hooks/
    pre-session.sh             # Session initialization
    post-commit.sh             # Commit validation and telemetry
    post-task.sh               # Task summary generation
```

## Development

This package has no build step. Skills are markdown files consumed directly by Claude Code, and hooks are standalone shell scripts.

```bash
# Verify hooks are executable
ls -la hooks/

# Test a hook locally
./hooks/pre-session.sh
./hooks/post-commit.sh
./hooks/post-task.sh
```
