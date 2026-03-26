---
name: finish
description: Mark the current task as done. Measures work (time, lines, AI vs manual), sends telemetry, checks for uncommitted work, and shows the updated task list.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Agent
  - WebFetch
  - AskUserQuestion
---

Help the developer wrap up their current task cleanly, measure the work done, and report telemetry.

**Execution style:** Minimize tool call noise. Combine pure-read infrastructure commands (config loads, active task reads, OTEL setup, timestamp calculations) into as few Bash calls as possible with brief descriptions like "Prepare telemetry". Keep context-dependent operations (git diff, git stash) and user-facing operations (task selection, PR checks, summaries) as separate calls.

## Steps

### 1. Check for uncommitted work

```bash
git status --short
git diff --stat
git diff --cached --stat
git stash list
```

If there are uncommitted changes, list them and use AskUserQuestion:
- Question: "You have uncommitted changes. What would you like to do?"
- Header: "Changes"
- Options:
  - Label: "Commit now", Description: "Stage and commit with a conventional commit message"
  - Label: "Stash for later", Description: "Stash changes so you can come back to them"
  - Label: "Leave as-is", Description: "Keep changes in working tree, finish the task anyway"

If they choose "Commit now", help them write a conventional commit message based on the diff.

### 2. Verify the task is complete

Check what the task was about:
- Look at the current branch name to infer the issue number
- Check if there's a linked GitHub issue

```bash
git branch --show-current
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
[ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH=$(git branch -r 2>/dev/null | sed 's/^[* ]*//' | grep -E '^origin/(main|master|develop)$' | head -1 | sed 's@^origin/@@')
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"
git log $DEFAULT_BRANCH..HEAD --oneline
```

If there's a linked issue, check its state:

```bash
gh issue view <number> --json state,title
```

Use AskUserQuestion:
- Question: "What's the status of this task?"
- Header: "Task status"
- Options:
  - Label: "Done", Description: "Task is complete — close it out and create a PR if needed"
  - Label: "Coming back later", Description: "Not finished yet — save progress and return to main"

If **Done**: proceed to close it out.
If **Coming back later**: just save progress and show the task list without marking it done.

### 3. Create a PR if needed

Check if a PR already exists for this branch:

```bash
gh pr list --head=$(git branch --show-current) --json number,url
```

If no PR exists and there are commits ahead of main, use AskUserQuestion:
- Question: "You have <N> commits not in a PR yet. Create one now?"
- Header: "Pull Request"
- Options:
  - Label: "Create PR", Description: "Push branch and open a pull request"
  - Label: "Skip", Description: "Don't create a PR right now"

### 4. Measure and report work

Load config, active task, and OTEL setup in a **single Bash call** ("Prepare telemetry"):

```bash
# Load Tandemu config
source ~/.claude/lib/tandemu-env.sh 2>/dev/null || source "$(git rev-parse --show-toplevel 2>/dev/null)/apps/claude-plugins/lib/tandemu-env.sh"

# Active task metadata
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

Extract `taskId`, `title`, `startedAt`, `repos` from the active task. If the file does not exist, use the current repo and estimate start from the first commit on the branch. Extract `organization.id` and `user.id` from the config env vars. Extract the OTEL endpoint.

#### 4a. Measure work across all repos

For each repo in the `repos` array:

```bash
# Detect default branch for this repo
DEFAULT_BRANCH=$(git -C <repo> symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
[ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH=$(git -C <repo> branch -r 2>/dev/null | sed 's/^[* ]*//' | grep -E '^origin/(main|master|develop)$' | head -1 | sed 's@^origin/@@')
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"

# Total lines added and removed on this branch
git -C <repo> diff $DEFAULT_BRANCH...HEAD --numstat 2>/dev/null

# All commits on this branch
git -C <repo> log $DEFAULT_BRANCH..HEAD --format='%H|||%an|||%s|||%b' 2>/dev/null
```

For AI vs Manual attribution:
- For each commit, check if the body contains `Co-Authored-By: Claude` (case-insensitive).
- For commits WITH Co-Authored-By Claude, get their individual line counts:
  ```bash
  git -C <repo> diff <commit>^..<commit> --numstat 2>/dev/null
  ```
  Sum those as `ai_lines`.
- All other line additions are `manual_lines`.
- If no commits have the Claude co-author tag, attribute all lines as `manual_lines`.

Calculate:
- `duration_seconds`: `startedAt` to now
- `total_commits`: total commits across all repos
- `ai_lines`: total additions from Claude-attributed commits
- `manual_lines`: total additions minus `ai_lines`

#### 4b. Send telemetry

Convert timestamps to nanoseconds (use the OTEL endpoint from the setup call above):

```bash
read START_NS END_NS DURATION_S TRACE_ID SPAN_ID <<< $(python3 -c "
from datetime import datetime, timezone
import secrets
start = datetime.fromisoformat('<startedAt>'.replace('Z','+00:00'))
end = datetime.now(timezone.utc)
start_ns = int(start.timestamp() * 1_000_000_000)
end_ns = int(end.timestamp() * 1_000_000_000)
duration_s = int((end - start).total_seconds())
print(start_ns, end_ns, duration_s, secrets.token_hex(16), secrets.token_hex(8))
")
```

**IMPORTANT: Telemetry MUST succeed for /finish to complete. If either the trace or metrics call fails, tell the developer and STOP — do not clear the active task, do not update the ticket status, do not proceed. The whole point of /finish is to record the work.**

**Send trace span** — this represents the completed task session:

```bash
TRACE_HTTP=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$OTEL_ENDPOINT/v1/traces" \
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
            {"key": "status", "value": {"stringValue": "completed"}},
            {"key": "ai_lines", "value": {"stringValue": "<ai_lines>"}},
            {"key": "manual_lines", "value": {"stringValue": "<manual_lines>"}},
            {"key": "duration_seconds", "value": {"stringValue": "'"$DURATION_S"'"}},
            {"key": "deployment", "value": {"stringValue": "true"}}
          ],
          "status": {}
        }]
      }]
    }]
  }' 2>/dev/null)
```

If `TRACE_HTTP` is not `200`, tell the developer: "Telemetry failed (trace span returned HTTP <code>). Check that the OTEL collector is running at $OTEL_ENDPOINT. You may need to re-run install.sh to fix the endpoint." Then **STOP** — do not continue with the rest of /finish.

**Send metrics** — lines of code and task completion:

```bash
METRICS_HTTP=$(curl -sf -o /dev/null -w "%{http_code}" -X POST "$OTEL_ENDPOINT/v1/metrics" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceMetrics": [{
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "claude-code"}},
          {"key": "organization_id", "value": {"stringValue": "<orgId>"}}
        ]
      },
      "scopeMetrics": [{
        "scope": {"name": "tandemu"},
        "metrics": [
          {
            "name": "tandemu.task.completed",
            "sum": {
              "dataPoints": [{"startTimeUnixNano": "'"$START_NS"'", "timeUnixNano": "'"$END_NS"'", "asDouble": 1}],
              "aggregationTemporality": 2,
              "isMonotonic": true
            }
          },
          {
            "name": "tandemu.lines_of_code",
            "sum": {
              "dataPoints": [
                {"startTimeUnixNano": "'"$START_NS"'", "timeUnixNano": "'"$END_NS"'", "asDouble": <ai_lines>, "attributes": [{"key": "type", "value": {"stringValue": "ai"}}]},
                {"startTimeUnixNano": "'"$START_NS"'", "timeUnixNano": "'"$END_NS"'", "asDouble": <manual_lines>, "attributes": [{"key": "type", "value": {"stringValue": "manual"}}]}
              ],
              "aggregationTemporality": 2,
              "isMonotonic": true
            }
          }
        ]
      }]
    }]
  }' 2>/dev/null)
```

If `METRICS_HTTP` is not `200`, tell the developer: "Telemetry failed (metrics returned HTTP <code>). Check that the OTEL collector is running at $OTEL_ENDPOINT. You may need to re-run install.sh to fix the endpoint." Then **STOP** — do not continue with the rest of /finish.

#### 4c. Update task status on ticket system

If the developer marked the task as "Done", update the status on the provider. First fetch the available statuses, then pick the one that best represents "done" or "completed":

```bash
curl -sf -H "Authorization: Bearer $TANDEMU_TOKEN" "$TANDEMU_API/api/tasks/<taskId>/statuses?provider=<provider>"
```

Pick the status that best represents "done", "completed", or "closed" from the returned list, then:

```bash
curl -sf -X PATCH "$TANDEMU_API/api/tasks/<taskId>" \
  -H "Authorization: Bearer $TANDEMU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"statusName": "<chosen status name>", "provider": "<provider>"}'
```

If you can't determine which status to use, skip this step silently.

#### 4d. Clear active task

```bash
rm -f ~/.claude/tandemu-active-task.json
```

Tell the developer:

```
Task completed: <title>
Duration: <elapsed>
Code: <ai_lines> AI lines + <manual_lines> manual lines (<total_commits> commits)
Telemetry: trace ✓ | metrics ✓
```

### 5. Reflect and store memories

After measuring the work, store memories about this task. Do this silently — don't announce it.

**Store shared org memories** (pass `app_id: "org"` in the add_memory call — visible to all team members after task completes):
- What was accomplished: "Completed <taskId> — <brief description of what was built/fixed>"
- Key architecture decisions made during the task
- New patterns or libraries introduced to the codebase
- Known gotchas discovered in specific files or modules
- Dependency quirks or workarounds found

**Store personal coding observations** (default user_id scope — only visible to this developer):
- Naming conventions the developer used or enforced
- Error handling patterns observed
- File organization choices
- Any corrections the developer made to your suggestions

**Store personal communication style** (if new patterns were noticed):

Review the developer's messages from this session. Look for persistent style patterns — NOT momentary mood. Only store if you noticed something new or different from what memory already has.

- Language formality level (casual/formal, slang, swearing)
- Recurring words or phrases they use (e.g., "dude", "sir", "lol", "LGTM")
- Message length preference (terse one-liners vs detailed explanations)
- How they give feedback (direct corrections vs suggestions vs questions)
- How they respond to your asides (engage? ignore? match humor?)

Store as: "Communication style: uses casual language, says 'dude', prefers short direct messages"
NOT as: "Was frustrated during task" or "Seemed tired today"

**Store personal observations (if any came up):**
- If the developer shared anything personal during the session
- If they responded to a rapport aside with something worth remembering

**Include a btw aside** if appropriate — but only if it connects to something that happened this session. Not random. Not every time.

### 6. Show the updated task list

Fetch the task list (same as /morning) and display it with the current task marked:

```
Task complete! Here's your updated board:

  [done] [<taskId>] <task title>
  2. [<id>] <next task title> (<priority>)
  3. [<id>] <another task> (<priority>)

Would you like to start another task?
```

### 7. Switch back to main

If the developer is done with the task:

```bash
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
[ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH=$(git branch -r 2>/dev/null | sed 's/^[* ]*//' | grep -E '^origin/(main|master|develop)$' | head -1 | sed 's@^origin/@@')
git checkout "${DEFAULT_BRANCH:-main}"
```

### Notes

- Never force-close or auto-merge anything — always ask
- If the developer says they're coming back to this task, don't mark it done and don't clear the active task
- The task list should reflect reality — pull from GitHub issues and Tandemu API
- This skill can be invoked multiple times a day as the developer finishes tasks
- Telemetry is sent via standard OTLP/HTTP JSON to the configured OTEL collector — this is how the Tandemu dashboard gets its data
- AI vs Manual attribution uses the `Co-Authored-By: Claude` tag in commit messages — Claude Code adds this automatically
