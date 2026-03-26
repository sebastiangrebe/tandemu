---
name: pause
description: Pause the current task. Snapshots progress, sends partial telemetry, and clears the active task so you can pick a new one with /morning.
allowed-tools:
  - Bash
  - Read
  - WebFetch
---

Pause the current task so the developer can switch to something else.

**Execution style:** Minimize tool call noise. Combine pure-read infrastructure commands (config loads, active task reads, OTEL setup, timestamp calculations) into as few Bash calls as possible with brief descriptions like "Setup". Keep user-facing operations (git stats, summaries) as separate calls.

## Steps

### 1. Setup — load config, active task, and OTEL endpoint

Run all setup reads in a **single Bash call** ("Setup"):

```bash
# Load Tandemu config
source ~/.claude/lib/tandemu-env.sh 2>/dev/null || source "$(git rev-parse --show-toplevel 2>/dev/null)/apps/claude-plugins/lib/tandemu-env.sh"
echo "---CONFIG---"
echo "TOKEN=$TANDEMU_TOKEN"
echo "API=$TANDEMU_API"
echo "ORG=$TANDEMU_ORG_ID"
echo "USER=$TANDEMU_USER_ID"

# Active task
echo "---ACTIVE_TASK---"
cat ~/.claude/tandemu-active-task.json 2>/dev/null || echo "NONE"

# OTEL endpoint
echo "---OTEL---"
python3 -c "
import json
try:
    s = json.load(open('$HOME/.claude/settings.json'))
    print(s.get('env',{}).get('OTEL_EXPORTER_OTLP_ENDPOINT','http://localhost:4318'))
except: print('http://localhost:4318')
" 2>/dev/null
```

If the active task file does not exist, tell the developer: "No active task to pause. Use /morning to start one." Then stop.

Extract `taskId`, `title`, `startedAt`, `repos` from the active task JSON.

### 2. Snapshot progress

Calculate elapsed time from `startedAt` to now.

For each repo in the `repos` array, gather git stats:

```bash
# Detect default branch for this repo
DEFAULT_BRANCH=$(git -C <repo> symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
[ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH=$(git -C <repo> branch -r 2>/dev/null | sed 's/^[* ]*//' | grep -E '^origin/(main|master|develop)$' | head -1 | sed 's@^origin/@@')
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"

git -C <repo> diff $DEFAULT_BRANCH...HEAD --numstat 2>/dev/null | awk '{a+=$1; d+=$2} END {print a+0, d+0}'
git -C <repo> rev-list $DEFAULT_BRANCH..HEAD --count 2>/dev/null || echo 0
```

Sum additions, deletions, and commits across all repos.

### 3. Send partial telemetry

Convert timestamps and send a `task_session` span with `status=paused` (use the OTEL endpoint from setup):

```bash
START_NS=$(python3 -c "from datetime import datetime; print(int(datetime.fromisoformat('<startedAt>'.replace('Z','+00:00')).timestamp()*1e9))")
END_NS=$(python3 -c "from datetime import datetime; print(int(datetime.utcnow().timestamp()*1e9))")
TRACE_ID=$(python3 -c "import secrets; print(secrets.token_hex(16))")
SPAN_ID=$(python3 -c "import secrets; print(secrets.token_hex(8))")

curl -sf -X POST "$OTEL_ENDPOINT/v1/traces" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "claude-code"}},
          {"key": "organization_id", "value": {"stringValue": "<orgId>"}}
        ]
      },
      "scopeSpans": [{
        "scope": {"name": "tandemu"},
        "spans": [{
          "traceId": "'"$TRACE_ID"'",
          "spanId": "'"$SPAN_ID"'",
          "name": "task_session",
          "kind": 1,
          "startTimeUnixNano": "'"$START_NS"'",
          "endTimeUnixNano": "'"$END_NS"'",
          "attributes": [
            {"key": "user_id", "value": {"stringValue": "<userId>"}},
            {"key": "task_id", "value": {"stringValue": "<taskId>"}},
            {"key": "status", "value": {"stringValue": "paused"}}
          ],
          "status": {}
        }]
      }]
    }]
  }' >/dev/null 2>&1 || true
```

### 4. Update task status on ticket system

Set the task back to a paused/backlog state on the provider. First fetch available statuses, then pick the one that best represents "paused", "on hold", "todo", or "backlog":

```bash
curl -sf -H "Authorization: Bearer $TANDEMU_TOKEN" "$TANDEMU_API/api/tasks/<taskId>/statuses?provider=<provider>"
```

Pick the status that best represents "todo", "backlog", "on hold", or "paused" from the returned list, then:

```bash
curl -sf -X PATCH "$TANDEMU_API/api/tasks/<taskId>" \
  -H "Authorization: Bearer $TANDEMU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"statusName": "<chosen status name>", "provider": "<provider>"}'
```

If you can't determine which status to use, skip this step silently.

### 5. Clear active task

```bash
rm -f ~/.claude/tandemu-active-task.json
```

### 6. Confirm

```
Task paused: <title>
Duration: <elapsed time>
Progress: <additions> additions, <deletions> deletions across <N> repo(s)

Run /morning to pick a new task, /create to log a new one, or resume this one later.
```
