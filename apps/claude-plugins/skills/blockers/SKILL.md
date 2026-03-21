---
name: blockers
description: Show team friction and blockers. Combines friction telemetry from Tandemu (prompt loops, errors by file) with blocked/stale tasks from the connected ticket system to surface what's slowing the team down.
argument-hint: [--team <team-name>] [--days <n>]
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - WebFetch
---

Show the team's friction points and blockers. Options: $ARGUMENTS

## Steps

### 1. Load Tandemu config

Read `~/.claude/tandemu.json`:

```bash
cat ~/.claude/tandemu.json
```

Extract `auth.token`, `api.url`, `organization.id`, and `team.id`. If `--team` is specified, override the default team. Default time range: last 7 days (override with `--days`).

If the file doesn't exist, tell the developer: "Tandemu is not configured. Run /tandemu to set it up."

### 2. Fetch data from Tandemu API

```bash
# Friction heatmap from telemetry
curl -sf -H "Authorization: Bearer <token>" "<api_url>/api/telemetry/friction-heatmap"

# DORA metrics
curl -sf -H "Authorization: Bearer <token>" "<api_url>/api/telemetry/dora-metrics"

# Tasks from connected ticket system — look for blocked/stale items
curl -sf -H "Authorization: Bearer <token>" "<api_url>/api/tasks?teamId=<team_id>&sprint=current"
```

### 3. Identify blockers

**From telemetry (friction heatmap):**
- Rank files by prompt loop count + error count
- Critical: 5+ prompt loops or 3+ errors
- Warning: 2-4 prompt loops

**From tasks:**
- Tasks in `in_review` status for more than 2 days (stale reviews)
- Tasks in `in_progress` for more than 5 days (potentially stuck)
- Tasks with `blocked` label or status

**Cross-reference:**
- For high-friction files, read the actual source code to understand why it's complex
- Check if the friction files relate to any in-progress tasks

### 4. Present the report

```markdown
## Team Blockers & Friction Report
**Period**: Last <N> days | **Team**: <team name>

### Critical Friction (developers getting stuck)

**<file path>** — <N> prompt loops, <N> errors
  - <N> developers hit issues here
  - Suggestion: <actionable recommendation based on reading the file>

### Stale/Blocked Tasks

- [<task.id>] <title> — in review for <N> days (<task.url>)
- [<task.id>] <title> — in progress for <N> days, possible blocker

### DORA Health

| Metric | Value | Level |
|---|---|---|
| Deployment Frequency | <value> | <Elite/High/Medium/Low> |
| Change Failure Rate | <value>% | <level> |
| Time to Restore | <value>h | <level> |

### Recommended Actions
1. <highest impact action>
2. <second action>
3. <third action>
```

### Notes

- Task data is live from the connected ticket system via Tandemu API
- Friction data is from ClickHouse telemetry via Tandemu API
- If no ticket system is connected, show telemetry-only blockers
- Focus on actionable insights, not blame
- Cross-reference friction paths with actual codebase for concrete suggestions
