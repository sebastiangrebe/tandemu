# CLAUDE.md — Tandem Project

## What Tandem Is

Tandem is an AI Teammate platform. Two goals:
1. Make AI coding personal — persistent memory, personality, learns your coding style
2. Track AI-native development — telemetry from `/morning` → work → `/finish` lifecycle, surfaced on a dashboard

## Architecture

```
tandem/
  apps/
    backend/        — NestJS API (Postgres + ClickHouse)
    frontend/       — Next.js dashboard (shadcn/ui + Recharts)
    mcp-server/     — MCP memory server (Mem0, currently unused — OpenMemory MCP used instead)
    claude-plugins/ — Skills, CLAUDE.md personality, hooks
    e2e/            — Playwright E2E tests
  packages/
    types/          — Shared TypeScript types
    database/       — SQL migrations
    telemetry/      — OTEL SDK (currently unused — skills send OTLP directly via curl)
```

## Key Decisions

### No `/tandem` skill
The `/tandem` skill was removed. All setup (OAuth, config, skills, MCP, CLAUDE.md) is handled by `install.sh`. Re-running install.sh re-authenticates.

### install.sh is for developers only
It installs Claude Code skills and config. No Docker, no git, no server setup. The company deploys the platform separately via `docker-compose.yml`.

### Single active task enforcement
`~/.claude/tandem-active-task.json` tracks the one active task across all Claude Code windows. `/morning` checks it before allowing a new task. Must `/pause` or `/finish` to switch.

### Task status sync is dynamic
No hardcoded status mappings. Skills fetch available statuses from the ticket system (`GET /api/tasks/:id/statuses?provider=linear`), then Claude picks the best match and sends `PATCH /api/tasks/:id/status` with the exact provider status name.

### Telemetry via OTLP from `/finish`
The `/finish` skill sends a `task_session` span and `tandem.lines_of_code` metrics to the OTEL collector via curl. This is real OTLP — standard protocol, custom metric names. No fake data.

AI vs manual attribution: commits with `Co-Authored-By: Claude` = AI lines, rest = manual.

### DORA metrics from task completions
- Deployment frequency = completed tasks per day
- Lead time = avg task duration (from `duration_seconds` span attribute, NOT ClickHouse Duration)
- Change failure rate and restore time = not yet implemented (need CI/CD integration)

### Backend queries use `duration_seconds` attribute
ClickHouse's computed `Duration` from span timestamps is unreliable when skills generate OTLP payloads (nanosecond precision issues). The `/finish` skill sends `duration_seconds` as a string attribute, and the backend reads it with `toFloat64OrZero(SpanAttributes['duration_seconds'])`.

### Friction from two sources
1. Custom friction logs sent by skills (SeverityText = 'prompt_loop' or 'error')
2. Native Claude Code `tool_result` events where `success = 'false'` (when OTEL is enabled)

The `GET /api/telemetry/friction-heatmap` endpoint combines both.

### `/morning` filters tasks for the current user
- First call: `?mine=true` — only tasks assigned to the current user's email
- Fallback: `?status=todo&unassigned=true` — unassigned backlog tasks
- Never shows someone else's in-progress work

### `/standup` uses time-based recency, not sprints
- "Done this week" = tasks with `status: done` AND `updatedAt` within 7 days
- Tasks matched to team members by `assigneeEmail` ↔ member `email`
- Unmatched tasks go to "Other Contributors"
- Backlog capped at 10 items

### Memory via OpenMemory MCP
- OpenMemory runs as a Docker container (`mem0/openmemory-mcp:latest`) on port 8765
- Claude Code connects via SSE: `http://host:8765/mcp/tandem/sse/{userId}`
- Memory scoped per user via the userId in the URL path
- install.sh writes the MCP config to `~/.claude.json`
- Requires `OPENAI_API_KEY` env var for embeddings

### CLAUDE.md personality system
`~/.claude/CLAUDE.md` (installed by install.sh) instructs Claude to:
- Search memories at session start (when tools available)
- Learn coding preferences passively (never ask directly)
- Use the developer's name when known
- Include "btw" moments for rapport (~1 in 3 interactions)
- Store observations after `/finish` (coding patterns, decisions, corrections)

### Dashboard pages
- **Dashboard** (`/`) — KPI cards, activity chart, AI ratio pie, DORA metrics
- **Activity** (`/activity`) — Stats cards, activity chart (taller), session log table with developer names
- **Friction Map** (`/friction-map`) — Severity cards, file-level friction list
- All three have team + time range filters via URL params (`?range=30d&team=...`)
- Old pages (`/ai-insights`, `/dora-metrics`, `/timesheets`) redirect to `/`

### ClickUp mapping at folder level
ClickUp `fetchProjects` returns folders (not individual lists) as mappable entities. `fetchTasks` auto-detects whether the mapped ID is a folder or list — fetches all lists in a folder if it's a folder.

### Settings permissions for Tandem
install.sh writes permissions to `~/.claude/settings.json` so skills can:
- Edit/Write `~/.claude/tandem*` files without prompting
- Run curl to the Tandem API and OTEL collector without prompting

### Setup wizard team creation bug
The setup wizard's team creation silently fails because the JWT at that point has `MEMBER` role with no org context, but the teams endpoint requires `OWNER`/`ADMIN`. Workaround: create teams via the Teams page after login.

## Running E2E Tests

```bash
cd apps/e2e

# Reset DB first:
docker exec -i tandem-postgres-1 psql -U tandem -d tandem \
  -c "TRUNCATE users, memberships, organizations, teams, team_members, invites, integrations, integration_project_mappings CASCADE;"

# Clean state:
rm -f ~/.claude/tandem-active-task.json ~/.claude/tandem.json

# Run:
npx playwright test full-flow
```

Tests must run from `apps/e2e/` directory (not repo root) to use the correct Playwright version.

The test temporarily disables CLAUDE.md and MCP during skill runs to prevent session bootstrap from blocking `claude -p` in non-interactive mode.

## Code Style

- TypeScript strict, ESM
- NestJS (backend): modules, controllers, services, guards
- Next.js (frontend): App Router, shadcn/ui (Radix base), Recharts
- Prettier: 2-space indent, single quotes, trailing commas
- Commits: Conventional Commits with `Co-Authored-By: Claude <noreply@anthropic.com>`

## API Endpoints

### Tasks
- `GET /api/tasks?teamId=&mine=true&status=&unassigned=true` — fetch tasks
- `GET /api/tasks/:taskId/statuses?provider=linear` — available statuses
- `PATCH /api/tasks/:taskId/status` — update status `{statusName, provider}`

### Telemetry
- `GET /api/telemetry/ai-ratio?startDate=&endDate=` — AI vs manual lines
- `GET /api/telemetry/friction-heatmap?startDate=&endDate=` — friction events
- `GET /api/telemetry/dora-metrics?periodStart=&periodEnd=` — DORA metrics
- `GET /api/telemetry/timesheets?startDate=&endDate=` — session timesheets (resolves user names from Postgres)
- `GET /api/telemetry/tool-usage` — Claude Code tool usage stats
- `GET /api/telemetry/session-quality` — session success/failure ratios

### Auth
- `POST /api/auth/register` — register
- `POST /api/auth/login` — login
- `GET /api/auth/me` — current user
- `POST /api/auth/cli/initiate` — start CLI auth flow
- `POST /api/auth/cli/authorize` — authorize CLI
- `GET /api/auth/cli/status?code=` — poll CLI auth status

## Docker Services

| Service | Port | Purpose |
|---------|------|---------|
| postgres | 5432 | Relational data |
| clickhouse | 8123 | Telemetry analytics |
| redis | 6379 | Cache |
| otel-collector | 4317/4318 | Telemetry ingestion |
| backend | 3001 | API |
| frontend | 3000 | Dashboard |
| openmemory | 8765 | MCP memory server |
