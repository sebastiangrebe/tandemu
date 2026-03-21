---
name: pause
description: Pause the current task. Snapshots progress, sends partial telemetry, and clears the active task so you can pick a new one with /morning.
allowed-tools:
  - Bash
  - Read
  - WebFetch
---

Pause the current task so the developer can switch to something else.

## Steps

### 1. Load config and active task

Read `~/.claude/tandemu.json`:

```bash
cat ~/.claude/tandemu.json
```

Extract `auth.token`, `api.url`, `organization.id`, `user.id`.

Read the active task:

```bash
cat ~/.claude/tandemu-active-task.json 2>/dev/null
```

If the file does not exist, tell the developer: "No active task to pause. Use /morning to start one." Then stop.

Extract `taskId`, `title`, `startedAt`, `repos`.

### 2. Snapshot progress

Calculate elapsed time from `startedAt` to now.

For each repo in the `repos` array, gather git stats:

```bash
git -C <repo> diff main...HEAD --numstat 2>/dev/null | awk '{a+=$1; d+=$2} END {print a+0, d+0}'
git -C <repo> rev-list main..HEAD --count 2>/dev/null || echo 0
```

Sum additions, deletions, and commits across all repos.

### 3. Send partial telemetry

Derive the OTEL endpoint:

```bash
OTEL_ENDPOINT=$(python3 -c "
import json
try:
    s = json.load(open('$HOME/.claude/settings.json'))
    print(s.get('env',{}).get('OTEL_EXPORTER_OTLP_ENDPOINT','http://localhost:4318'))
except: print('http://localhost:4318')
" 2>/dev/null)
```

Convert timestamps to nanoseconds and send a `task_session` span with `status=paused`:

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
        "scope tandemu"},
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
curl -sf -H "Authorization: Bearer <token>" "<api_url>/api/tasks/<taskId>/statuses?provider=<provider>"
```

Pick the status that best represents "todo", "backlog", "on hold", or "paused" from the returned list, then:

```bash
curl -sf -X PATCH "<api_url>/api/tasks/<taskId>/status" \
  -H "Authorization: Bearer <token>" \
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

Run /morning to pick a new task or resume this one later.
```
