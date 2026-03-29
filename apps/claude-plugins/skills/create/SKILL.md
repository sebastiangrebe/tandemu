---
name: create
description: Create a new task in the team's ticket system. Use when you discover work that needs tracking while coding.
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

Create a new task in the team's ticket system. Use when you discover work that needs tracking while coding.

## Steps

### 1. Setup

```bash
source ~/.claude/lib/tandemu-env.sh 2>/dev/null || source "$(git rev-parse --show-toplevel 2>/dev/null)/apps/claude-plugins/lib/tandemu-env.sh"
echo "---CONFIG---"
echo "TOKEN=$TANDEMU_TOKEN"
echo "API=$TANDEMU_API"
echo "TEAM=$TANDEMU_TEAM_ID"
echo "EMAIL=$TANDEMU_USER_EMAIL"

echo "---ACTIVE_TASK---"
BRANCH_SLUG=$(git branch --show-current 2>/dev/null | sed 's/\//-/g' || echo "unknown")
cat "$HOME/.claude/tandemu-active-task-${BRANCH_SLUG}.json" 2>/dev/null || echo "NONE"
```

### 2. Get task details

Use AskUserQuestion to get the task title. The developer should be able to type freely:
- Question: "What needs to be done?"
- Header: "New Task"
- Options:
  - Label: "Bug fix", Description: "Something is broken and needs fixing"
  - Label: "Feature", Description: "New functionality to build"
  - Label: "Tech debt", Description: "Cleanup, refactor, or improvement"

The developer will likely select "Other" and type their own title. Use whatever they provide as the task title.

Then optionally ask for priority:
- Question: "What priority?"
- Header: "Priority"
- Options:
  - Label: "Urgent", Description: "Drop everything"
  - Label: "High", Description: "Do it soon"
  - Label: "Medium", Description: "Normal priority"
  - Label: "Low", Description: "When you get to it"

### 3. Create the task

```bash
RESULT=$(curl -sf -X POST "$TANDEMU_API/api/tasks" \
  -H "Authorization: Bearer $TANDEMU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "teamId": "'"$TANDEMU_TEAM_ID"'",
    "title": "<title from step 2>",
    "description": "<description if provided>",
    "assigneeEmail": "'"$TANDEMU_USER_EMAIL"'",
    "priority": "<priority from step 2>"
  }')
echo "$RESULT"
```

Extract the task ID and URL from the response.

### 4. What to do next

If there's an active task (from step 1), use AskUserQuestion:
- Question: "Task created: **<title>** (<task.id>). What would you like to do?"
- Header: "Next"
- Options:
  - Label: "Continue current task", Description: "Keep working on <active task title>"
  - Label: "Switch to new task", Description: "Pause current and start working on the new one"
  - Label: "Leave for later", Description: "Task is logged — someone can pick it up"

If **Continue current task**: just confirm and stop.

If **Switch to new task**:
  1. Pause the current task (send partial telemetry, update status back to todo)
  2. Set up the new task: create branch, write active task file, update status to in progress
  3. Show readiness summary (same as /morning step 6)

If **Leave for later**: just confirm creation and stop.

If there's NO active task, use AskUserQuestion:
- Question: "Task created: **<title>** (<task.id>). What would you like to do?"
- Header: "Next"
- Options:
  - Label: "Start working on it", Description: "Set it up as your active task"
  - Label: "Leave for later", Description: "Task is logged — pick it up with /morning"

### 5. Confirm

Show:
```
Created: [<task.id>] <title>
URL: <task.url>
Priority: <priority>
Status: <what was decided in step 4>
```

### Notes

- The task is created in whichever ticket system is connected to the team (Linear, Jira, ClickUp, etc.)
- The developer's email is auto-assigned unless they choose "Leave for later"
- If no integration is configured, tell the developer to connect one at the dashboard
- This skill works standalone or after /pause suggests it
