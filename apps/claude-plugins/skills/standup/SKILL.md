---
name: standup
description: Generate a team standup report. Pulls pre-computed standup data from the Tandemu API (task attribution, telemetry, blockers) and formats it as a team-level summary.
argument-hint: [--team <team-name>] [--format <slack|markdown|plain>]
allowed-tools:
  - Bash
  - Read
  - WebFetch
---

Generate a team standup report. Options: $ARGUMENTS

**Execution style:** Minimize tool call noise. Load config and fetch standup data in a single Bash call ("Fetch standup data"). Keep the formatted report output as a separate step.

## Steps

### 1. Fetch standup data

Load config and fetch all pre-computed standup data in a **single Bash call** ("Fetch standup data"):

```bash
# Load Tandemu config
. "$HOME/.claude/lib/tandemu-env.sh" 2>/dev/null || . "$(git rev-parse --show-toplevel 2>/dev/null)/apps/claude-plugins/lib/tandemu-env.sh"

# Multi-team support: resolve --team argument or prompt if multiple teams
ACTIVE_TEAM_ID="$TANDEMU_TEAM_ID"
echo "TEAM_COUNT=$TANDEMU_TEAM_COUNT"
echo "TEAM_IDS=$TANDEMU_TEAM_IDS"
echo "TEAM_NAMES=$TANDEMU_TEAM_NAMES"

# If --team is specified, resolve name to ID
# If TEAM_COUNT > 1 and no --team flag, Claude should use AskUserQuestion to prompt

# Use local time so date boundaries match the developer's day
YESTERDAY=$(date -v-1d +%Y-%m-%dT00:00:00Z 2>/dev/null || date -d "yesterday" +%Y-%m-%dT00:00:00Z)
NOW=$(date +%Y-%m-%dT23:59:59Z)

echo "---LOCAL_TIME---"
echo "LOCAL_NOW=$(date '+%Y-%m-%d %H:%M %Z')"
echo "LOCAL_TODAY=$(date +%Y-%m-%d)"

echo "---STANDUP---"
curl -sf -H "Authorization: Bearer $TANDEMU_TOKEN" "$TANDEMU_API/api/tasks/standup?teamId=$ACTIVE_TEAM_ID&startDate=$YESTERDAY&endDate=$NOW"
```

If the config load fails, tell the developer: "Tandemu is not configured. Run install.sh to set it up."

The standup endpoint returns pre-computed data with task attribution, telemetry, and blockers already resolved:

```typescript
{
  team: { id, name, memberCount },
  summary: { inProgress, inReview, doneThisWeek, todoCount },
  members: [{
    id, name, email,
    tasks: { inProgress: Task[], inReview: Task[], recentlyDone: Task[] },
    telemetry: { activeMinutes, sessions, aiLines, manualLines, frictionFiles: [{ path, count }] },
  }],
  otherContributors: [{ assigneeName?, assigneeEmail?, tasks: Task[] }],
  unassigned: Task[],
  backlog: { tasks: Task[], totalCount: number },
  blockers: [{ type, taskId?, title?, stalledDays?, filePath?, frictionCount?, affectedDevs? }],
}
```

### 2. Format the standup report

Use the pre-computed data to produce the report. Do NOT re-filter or re-attribute tasks — the backend has already done this correctly.

**Report structure:**

```markdown
## Team Standup — <date>
**Team**: <team.name> | **Members**: <team.memberCount>

### Summary
- **In progress**: <summary.inProgress> | **In review**: <summary.inReview> | **Done this week**: <summary.doneThisWeek>
- **Active sessions**: <count members with sessions > 0> members coded recently (<sum activeMinutes / 60>h)
- **AI-assisted**: <sum aiLines> AI lines / <sum manualLines> manual lines
- **Friction hotspots**: <top friction files across members, or "None detected">

### Per-Person Updates

Only show members from the `members` array (backend already filtered to those with tasks or telemetry).

**<name>** (<email>) — <activeMinutes / 60>h active
- Working on:
  - [<task.id>] <title> (<priority>)
- Recently completed:
  - [<task.id>] <title>
- Friction: <frictionFiles paths and counts, or omit if empty>

### Other Contributors

Tasks assigned to people not on this Tandemu team (from `otherContributors`):

- [<task.id>] <title> — assigned to <assigneeName> (<assigneeEmail>)

### Backlog

<backlog.totalCount> tasks in backlog. Top items:
- [<task.id>] <title> (<priority>)
- ... (backlog.tasks has max 10; if totalCount > 10, say "and <N> more")

### Blockers
- For `stalled_review` type: "[<taskId>] <title> in review for <stalledDays> days"
- For `high_friction` type: "<filePath>: <frictionCount> friction events affecting <affectedDevs> developers"
- If blockers array is empty: "No blockers detected."
```

### 3. Format output

Default: markdown. If `--format slack`, use Slack bold markers (`*bold*`). If `--format plain`, plain text without markdown.

### Notes

- All task attribution, categorization, and telemetry matching is done server-side by `GET /api/tasks/standup`
- The skill only formats the response — it does not filter, deduplicate, or match tasks to members
- Do not mention sprints, cycles, or iteration boundaries — use "this week" or "recently" instead
- Respect privacy — show work output, not surveillance metrics
- If the standup endpoint fails, tell the developer and suggest checking if the ticket system is connected
