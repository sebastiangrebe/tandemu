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

## Troubleshooting

### Check pipeline health
```bash
curl -sf http://localhost:3001/api/telemetry/health
# Returns: { "clickhouse": "ok", "collector": "ok" }
```

### Verify collector is receiving data
```bash
# Check collector logs (docker)
docker compose logs otel-collector --tail 20

# Send a test span
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[]}'
# Should return 200
```

### Verify ClickHouse has data
```bash
# Check trace count
docker exec tandemu-clickhouse-1 clickhouse-client \
  --database otel --query "SELECT count() FROM otel_traces"

# Check recent spans
docker exec tandemu-clickhouse-1 clickhouse-client \
  --database otel --query "SELECT SpanName, count() FROM otel_traces GROUP BY SpanName"
```

### Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Dashboard shows no data | Backend can't reach collector | Check `OTEL_EXPORTER_OTLP_ENDPOINT` env var |
| `/finish` telemetry fails | Wrong OTEL endpoint | Verify `otel.endpoint` in backend config |
| ClickHouse empty | Collector can't reach ClickHouse | Check `CLICKHOUSE_ENDPOINT` in collector config |
| Native Claude Code data missing | OTEL not enabled in Claude Code | Run `/tandemu:setup` to configure |

### Environment variables

**Backend:**
- `OTEL_EXPORTER_OTLP_ENDPOINT` — collector HTTP endpoint (default: `http://localhost:4318`)
- `CLICKHOUSE_URL` — ClickHouse HTTP endpoint for queries (default: `http://localhost:8123`)

**OTEL Collector:**
- `CLICKHOUSE_ENDPOINT` — ClickHouse TCP endpoint for inserts (default: `tcp://clickhouse:9000`)
- `CLICKHOUSE_DATABASE` — database name (default: `otel`)
- `CLICKHOUSE_USERNAME` — (default: `default`)
- `CLICKHOUSE_PASSWORD` — (default: empty)

**Claude Code (in `~/.claude/settings.json`):**
- `OTEL_EXPORTER_OTLP_ENDPOINT` — where to send native telemetry
- `CLAUDE_CODE_ENABLE_TELEMETRY` — must be `"1"` to enable
