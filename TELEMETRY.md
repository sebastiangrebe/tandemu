# Telemetry Architecture

Tandemu collects engineering telemetry from two sources. Understanding which data comes from where is critical for multi-tool expansion.

## Source 1: `/finish` skill (tool-agnostic)

When a developer runs `/finish`, the skill collects raw git data and POSTs it to `POST /api/telemetry/tasks/:taskId/finish`. The backend processes AI attribution and sends OTLP to the collector.

**Data collected locally by the skill:**
- Per-file additions/deletions (from `git diff --numstat`)
- Commit list with Co-Authored-By detection (from `git log`)
- Changed file list (from `git diff --name-only`)
- Task metadata (category, labels from active task file)

**Backend processing:**
1. Queries native OTEL data (if available) for accurate AI attribution — checks which files the AI tool edited via tool events
2. Falls back to Co-Authored-By commit analysis if no native data
3. Sends OTLP trace span (`task_session`) and metrics (`tandemu.lines_of_code`) to the collector

**This is tool-agnostic.** The same `/finish` skill works regardless of whether Claude Code, Codex, or Cursor was used. The backend handles tool-specific attribution logic.

## Source 2: Native AI tool OTEL (tool-specific)

When OTEL is enabled in the AI coding tool, it sends data directly to the collector.

### Claude Code
- `tool_result` log events (tool name, success, duration, file paths)
- `claude_code.cost.usage` metric (USD per session)
- `claude_code.token.usage` metric (by type and model)
- `claude_code.lines_of_code.count` metric (added/removed)
- `claude_code.active_time.total` metric (keyboard + CLI seconds)

### Codex (future)
- `codex.tool.call` metrics + logs (different attribute schema)
- Token counts via `codex.api_request` events
- **Requires normalization layer** to map to common schema

### Cursor (future)
- **No OTEL support** — REST API only (`api.cursor.com/auth/team/analytics`)
- **Requires polling adapter** to ingest into the pipeline

## Dashboard data sources

| Chart | Source | Tool-agnostic? |
|-------|--------|----------------|
| AI Ratio | `/finish` → `tandemu.lines_of_code` | Yes |
| Activity / Timesheets | `/finish` → `task_session` spans | Yes |
| Developer Stats | `/finish` → `task_session` spans | Yes |
| Task Velocity | `/finish` → `task_session` spans | Yes |
| Hot Files | `/finish` → `changed_files` span attr | Yes |
| Investment Allocation | `/finish` → `task_category` span attr | Yes |
| AI Effectiveness | `/finish` → `ai_files` span attr | Yes |
| Tool Usage | Native → `tool_result` log events | **Claude Code only** |
| AI Cost | Native → `claude_code.cost.usage` | **Claude Code only** |
| Token Usage | Native → `claude_code.token.usage` | **Claude Code only** |
| Friction Map | Both → custom logs + native `tool_result` | Partial |

## Enabling native OTEL

### Claude Code
Set in `~/.claude/settings.json`:
```json
{
  "env": {
    "OTEL_EXPORTER_OTLP_ENDPOINT": "https://otel.tandemu.dev"
  }
}
```

The Tandemu setup skill (`/tandemu:setup`) configures this automatically.

## Multi-tool expansion

When adding Codex or Cursor support:
1. The `/finish` skill works as-is — git data collection is tool-agnostic
2. The backend's `getNativeAIAttribution()` needs tool-specific adapters for each native OTEL schema
3. Dashboard queries marked "Claude Code only" need a normalization layer mapping `codex.*` → common schema
4. Cursor requires a separate polling adapter since it has no OTEL
