---
name: standup
description: Generate a team standup report. Pulls task progress from the connected ticket system via Tandem API, combines with telemetry data (session time, AI ratio, friction), and produces a team-level summary.
argument-hint: [--team <team-name>] [--format <slack|markdown|plain>]
allowed-tools:
  - Bash
  - Read
  - WebFetch
---

Generate a team standup report. Options: $ARGUMENTS

## Steps

### 1. Load Tandem config

Read `~/.claude/tandem.json`:

```bash
cat ~/.claude/tandem.json
```

Extract `auth.token`, `api.url`, `organization.id`, and `team.id`. If `--team` is specified, override the default team.

If the file doesn't exist, tell the developer: "Tandem is not configured. Run /tandem to set it up."

### 2. Fetch data from Tandem API

Make these calls in parallel:

```bash
# Team members
curl -sf -H "Authorization: Bearer <token>" "<api_url>/api/organizations/<org_id>/teams/<team_id>/members"

# Tasks from connected ticket system (in_progress and done recently)
curl -sf -H "Authorization: Bearer <token>" "<api_url>/api/tasks?teamId=<team_id>&sprint=current"

# Telemetry: session timesheets (last 24h)
YESTERDAY=$(date -u -v-1d +%Y-%m-%dT00:00:00Z 2>/dev/null || date -u -d "yesterday" +%Y-%m-%dT00:00:00Z)
NOW=$(date -u +%Y-%m-%dT23:59:59Z)
curl -sf -H "Authorization: Bearer <token>" "<api_url>/api/telemetry/timesheets?startDate=$YESTERDAY&endDate=$NOW"

# Telemetry: AI ratio
curl -sf -H "Authorization: Bearer <token>" "<api_url>/api/telemetry/ai-ratio"

# Telemetry: friction events
curl -sf -H "Authorization: Bearer <token>" "<api_url>/api/telemetry/friction-heatmap"
```

### 3. Compile the team standup

Cross-reference tasks with telemetry to build the report:

```markdown
## Team Standup — <date>
**Team**: <team name> | **Members**: <count>

### Team Summary
- **Active sessions**: <N> members coded yesterday (<total hours>h)
- **AI-assisted**: <ratio>x (<ai_lines> AI lines / <manual_lines> manual)
- **Tasks in progress**: <count> | **Done this sprint**: <count>
- **Friction hotspots**: <top file paths with high prompt loops>

### Per-Person Updates

**<Name>** (<hours>h active)
- Working on: <in_progress tasks from ticket system>
- Completed: <done tasks from ticket system>
- Friction: <any files with prompt loops for this user>

### Team Blockers
- <tasks stuck in review or blocked status>
- <high-friction files affecting multiple developers>
```

### 4. Format output

Default: markdown. If `--format slack`, use Slack bold markers. If `--format plain`, plain text.

### Notes

- Task data comes from the Tandem API (proxied from the connected ticket system) — always live, never cached
- Telemetry data (session time, AI ratio, friction) comes from ClickHouse via the Tandem API
- If no ticket system is connected, show telemetry-only data and note that tasks are unavailable
- If no telemetry data exists, show task-only data
- Respect privacy — show work output, not surveillance metrics
