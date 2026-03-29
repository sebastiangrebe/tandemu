---
name: standup
description: Generate a team standup report. Pulls task progress from the connected ticket system via Tandemu API, combines with telemetry data (session time, AI ratio, friction), and produces a team-level summary.
argument-hint: [--team <team-name>] [--format <slack|markdown|plain>]
allowed-tools:
  - Bash
  - Read
  - WebFetch
---

Generate a team standup report. Options: $ARGUMENTS

**Execution style:** Minimize tool call noise. Load config and fetch all API data in a single Bash call ("Fetch team data"). Keep the formatted report output as a separate step.

## Steps

### 1. Fetch team data

Load config and fetch all data in a **single Bash call** ("Fetch team data"):

```bash
# Load Tandemu config
source ~/.claude/lib/tandemu-env.sh 2>/dev/null || source "$(git rev-parse --show-toplevel 2>/dev/null)/apps/claude-plugins/lib/tandemu-env.sh"

# Multi-team support: resolve --team argument or prompt if multiple teams
# Parse --team from arguments
ACTIVE_TEAM_ID="$TANDEMU_TEAM_ID"
ACTIVE_TEAM_NAME=""
echo "TEAM_COUNT=$TANDEMU_TEAM_COUNT"
echo "TEAM_IDS=$TANDEMU_TEAM_IDS"
echo "TEAM_NAMES=$TANDEMU_TEAM_NAMES"

# If --team is specified, resolve name to ID
# The Claude agent will parse the argument and do the lookup from TANDEMU_TEAM_NAMES/IDS
# If TEAM_COUNT > 1 and no --team flag, Claude should use AskUserQuestion to prompt

# Use local time (not UTC) so date boundaries match the developer's day
YESTERDAY=$(date -v-1d +%Y-%m-%dT00:00:00Z 2>/dev/null || date -d "yesterday" +%Y-%m-%dT00:00:00Z)
NOW=$(date +%Y-%m-%dT23:59:59Z)

# Local time context for accurate relative dates
echo "---LOCAL_TIME---"
echo "TZ=$(date +%Z)"
echo "OFFSET=$(date +%z)"
echo "LOCAL_NOW=$(date '+%Y-%m-%d %H:%M %Z')"
echo "LOCAL_TODAY=$(date +%Y-%m-%d)"
echo "LOCAL_YESTERDAY=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d 'yesterday' +%Y-%m-%d)"

echo "---MEMBERS---"
curl -sf -H "Authorization: Bearer $TANDEMU_TOKEN" "$TANDEMU_API/api/organizations/$TANDEMU_ORG_ID/teams/$ACTIVE_TEAM_ID/members"

echo "---TASKS---"
curl -sf -H "Authorization: Bearer $TANDEMU_TOKEN" "$TANDEMU_API/api/tasks?teamId=$ACTIVE_TEAM_ID"

echo "---TIMESHEETS---"
curl -sf -H "Authorization: Bearer $TANDEMU_TOKEN" "$TANDEMU_API/api/telemetry/timesheets?startDate=$YESTERDAY&endDate=$NOW"

echo "---AI_RATIO---"
curl -sf -H "Authorization: Bearer $TANDEMU_TOKEN" "$TANDEMU_API/api/telemetry/ai-ratio"

echo "---FRICTION---"
curl -sf -H "Authorization: Bearer $TANDEMU_TOKEN" "$TANDEMU_API/api/telemetry/friction-heatmap"
```

If the config load fails, tell the developer: "Tandemu is not configured. Run install.sh to set it up."

### 2. Compile the team standup

**IMPORTANT attribution rules:**

- Each task has an `assigneeEmail` field from the ticket system.
- Each Tandemu team member has an `email` field and an `emails` array (which includes their primary email plus any aliases).
- Match tasks to team members by checking if `task.assigneeEmail` is in `member.emails`.
- Only show a task under a person if their `emails` array contains the task's `assigneeEmail`.
- Tasks where `assigneeEmail` doesn't match any team member go in an "Other contributors" section (they may be assigned to people not in Tandemu yet).
- Unassigned tasks (no `assigneeEmail`) go in the "Unassigned" section.

**Task categorization (by recency, NOT by sprint):**

- **Recently completed**: tasks with `status: done` AND `updatedAt` within the last 7 days.
- **In progress**: tasks with `status: in_progress`.
- **In review**: tasks with `status: in_review`.
- **Todo**: tasks with `status: todo`. Show at most 10, and mention how many more exist.
- Do NOT use the word "sprint" in the report. Use "this week" or "recently" instead.
- Ignore tasks with `status: done` that were completed more than 7 days ago — they are not relevant to a standup.
- **Timezone handling**: When categorizing tasks as "done today", "done yesterday", or "done this week", convert `updatedAt` timestamps to the developer's local timezone (using LOCAL_TODAY, LOCAL_YESTERDAY, and OFFSET from setup) before comparing dates. Do not compare raw UTC timestamps against local day boundaries.

**Report structure:**

```markdown
## Team Standup — <date>
**Team**: <team name> | **Members**: <count>

### Summary
- **In progress**: <count> | **In review**: <count> | **Done this week**: <count>
- **Active sessions**: <N> members coded in the last 24h (<total hours>h)
- **AI-assisted**: <ai_lines> AI lines / <manual_lines> manual lines
- **Friction hotspots**: <top file paths with high prompt loops, or "None detected">

### Per-Person Updates

Only include team members who have tasks assigned to them OR telemetry activity.

**<Name>** (<email>) — <hours>h active
- Working on:
  - [<task.id>] <title> (<priority>)
- Recently completed:
  - [<task.id>] <title>
- Friction: <files with prompt loops for this user, or omit if none>

### Other Contributors

Tasks assigned to people not on this Tandemu team:

- [<task.id>] <title> — assigned to <assigneeName> (<assigneeEmail>)

### Backlog

<count> tasks in backlog. Top items:
- [<task.id>] <title> (<priority>)
- ... (show up to 10, then "and <N> more")

### Blockers
- <tasks in_review for more than 2 days>
- <high-friction files affecting multiple developers>
- If no blockers detected, say "No blockers detected."
```

### 3. Format output

Default: markdown. If `--format slack`, use Slack bold markers. If `--format plain`, plain text.

### Notes

- Task data comes from the Tandemu API (proxied from the connected ticket system) — always live, never cached
- Telemetry data (session time, AI ratio, friction) comes from ClickHouse via the Tandemu API
- If no ticket system is connected, show telemetry-only data and note that tasks are unavailable
- If no telemetry data exists, show task-only data
- Respect privacy — show work output, not surveillance metrics
- NEVER attribute a task to someone unless their `emails` array contains the task's assigneeEmail
- Do not mention sprints, cycles, or iteration boundaries — use time-based recency instead
