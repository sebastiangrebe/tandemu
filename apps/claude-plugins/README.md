# @tandemu/claude-plugins

Claude Code plugin system for the Tandemu AI Teammate platform. This package provides skills, hooks, and configuration templates that extend Claude Code with Tandemu-specific workflows.

## Overview

The plugin system consists of four parts:

1. **CLAUDE.md** — The AI Teammate's "constitution" that defines behavior, code style, and workflows
2. **Skills** — Markdown-defined workflows that Claude Code can execute as slash commands
3. **Hooks** — Shell scripts that run at specific lifecycle events
4. **Config templates** — JSON configuration for connecting to the Tandemu platform and MCP memory server

## Skills

Skills are invoked as slash commands within a Claude Code session. Each skill is defined as a markdown file in `skills/` containing step-by-step instructions.

| Skill | Command | Description |
|-------|---------|-------------|
| **checkout** | `/checkout <ticket-id> <desc>` | Creates a feature branch from main, loads issue context, and prepares the working environment |
| **review** | `/review [--strict]` | Analyzes the current diff against main for code style, security, performance, and architecture issues |
| **pr-create** | `/pr-create [--draft]` | Generates a PR title and description from commits and diffs, then creates the PR via `gh` CLI |
| **standup** | `/standup [--days n]` | Queries recent git activity and formats a standup update with done/in-progress/blockers |

### Adding a new skill

Create a new markdown file in `skills/` following the existing pattern:

1. Add a title and usage section
2. Write step-by-step instructions that Claude Code will follow
3. Include example commands and expected output formats
4. Register the skill name in .tandemu-config.example.json` under `plugins.skills`

## Hooks

Hooks are shell scripts in `hooks/` that run at specific points in the development lifecycle.

| Hook | File | Trigger |
|------|------|---------|
| **pre-session** | `hooks/pre-session.sh` | Runs at session start. Loads CLAUDE.md, checks for `.tandemu-config`, sets up telemetry environment variables. |
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

## Configuration

### Tandemu config

Copy .tandemu-config.example.json` to `.tandemu-config` in your repo root and fill in your organization details:

```bash
cp apps/claude-plugins.tandemu-config.example.json .tandemu-config
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

This connects Claude Code to the Tandemu MCP memory server, enabling persistent memory across sessions via `memory_store`, `memory_recall`, and `memory_search` tools.

## Project Structure

```
apps/claude-plugins/
  CLAUDE.md                    # AI Teammate constitution
  README.md                    # This file
  package.json                 # Package metadata
  tsconfig.json                # TypeScript config
 .tandemu-config.example.json   # Tandemu platform config template
  mcp-config.example.json      # MCP server config template
  skills/
    checkout.md                # Branch creation and setup
    review.md                  # Code review analysis
    pr-create.md               # PR generation
    standup.md                 # Standup report generation
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
