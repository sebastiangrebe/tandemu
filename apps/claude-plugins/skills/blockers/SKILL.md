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

**Execution style:** Minimize tool call noise. Load config and fetch all API data in a single Bash call ("Fetch blocker data"). Keep the analysis and formatted report as separate steps.

## Steps

### 1. Fetch blocker data

Load config and fetch all data in a **single Bash call** ("Fetch blocker data"):

```bash
# Load Tandemu config
source ~/.claude/lib/tandemu-env.sh 2>/dev/null || source "$(git rev-parse --show-toplevel 2>/dev/null)/apps/claude-plugins/lib/tandemu-env.sh"

# If --team is specified, override $TANDEMU_TEAM_ID here

echo "---FRICTION---"
curl -sf -H "Authorization: Bearer $TANDEMU_TOKEN" "$TANDEMU_API/api/telemetry/friction-heatmap"

echo "---DORA---"
curl -sf -H "Authorization: Bearer $TANDEMU_TOKEN" "$TANDEMU_API/api/telemetry/dora-metrics"

echo "---TASKS---"
curl -sf -H "Authorization: Bearer $TANDEMU_TOKEN" "$TANDEMU_API/api/tasks?teamId=$TANDEMU_TEAM_ID"
```

If the config load fails, tell the developer: "Tandemu is not configured. Run install.sh to set it up."

### 2. Identify blockers

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

### 3. Present the report

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
