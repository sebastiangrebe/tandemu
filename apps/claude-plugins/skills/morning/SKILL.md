---
name: morning
description: Start your work session. Fetches your assigned tasks from the Tandemu API (which proxies your team's ticket system — Jira, Linear, ClickUp, or GitHub Issues), shows a priority-sorted list, and lets you pick what to work on.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Agent
  - WebFetch
  - AskUserQuestion
---

Help the developer start their work session by picking a task.

## Steps

### 0. Greet personally (memory)

Before anything else, search memories for the developer's personal context — their name, what they were working on recently, any preferences. Use this to greet them personally.

If you know their name: "Morning, Sebastian. Let me pull up your tasks."
If you don't know their name yet: "Good morning! Let me get your tasks."

If you remember what they worked on recently, mention it: "Last time you were working on the invoice module — want to continue or pick something new?"

Do this naturally, don't announce you're searching memories.

### 1. Load Tandemu config

Read `~/.claude/tandemu.json`:

```bash
cat ~/.claude/tandemu.json
```

Extract `auth.token`, `api.url`, `organization.id`, and `team.id`.

If the file doesn't exist, tell the developer: "Tandemu is not configured. Run /tandemu to set it up."

### 2. Check for active task

```bash
cat ~/.claude/tandemu-active-task.json 2>/dev/null
```

If the file exists and contains valid JSON:

- Extract `taskId`, `title`, `startedAt`, `repos` from it.
- Calculate how long ago the task was started.
- Get the current repo path:

```bash
git rev-parse --show-toplevel 2>/dev/null
```

- Tell the developer: "You have an active task: **<title>** (started <relative time ago>)"
- Use AskUserQuestion:
  - Question: "You're currently working on **<title>**. What would you like to do?"
  - Header: "Active Task"
  - Options:
    - Label: "Continue here", Description: "Keep working on this task in the current repo"
    - Label: "Pause and pick another", Description: "Run /pause first to switch tasks"

- If they choose **Continue here**:
  - If the current repo is not already in the `repos` array, add it by reading, modifying, and rewriting `~/.claude/tandemu-active-task.json`.
  - Check if a branch for the task already exists, if not create one.
  - Skip to the readiness summary (Step 5).
- If they choose **Pause and pick another**: tell the developer to run `/pause` first, then `/morning` again. Stop here.

If the file does not exist, proceed to Step 3.

### 3. Fetch tasks from Tandemu

Fetch tasks assigned to the current developer:

```bash
curl -sf -H "Authorization: Bearer <token>" "<api_url>/api/tasks?teamId=<team_id>&mine=true"
```

The response is `{ success, data: Task[] }` where each task has: `id`, `title`, `description`, `status`, `priority`, `assigneeName`, `assigneeEmail`, `labels`, `url`, `provider`.

Filter to tasks that are `todo` or `in_progress` status.

If the developer has assigned tasks, proceed to Step 4 with those.

If no tasks are assigned to the developer, fetch **unassigned todo tasks** that they could pick up:

```bash
curl -sf -H "Authorization: Bearer <token>" "<api_url>/api/tasks?teamId=<team_id>&status=todo&unassigned=true"
```

Tell the developer: "No tasks are assigned to you. Here are unassigned tasks you could pick up:"

If both calls return empty, tell the developer: "No tasks found. Your team may not have a ticket system connected yet — ask your admin to set one up at the Tandemu dashboard (Integrations page)."

### 4. Let the developer pick a task

Use AskUserQuestion to present the tasks as a selectable list:
- Question: "What would you like to work on?"
- Header: "Tasks"
- Options: build dynamically from the fetched tasks (max 4, prioritized by: urgent > high > medium > low). Each option:
  - Label: the task title (truncated to fit)
  - Description: `<task.id> · <priority> · <provider>` (e.g., "TAND-42 · high · jira")
- The user can select "Other" to describe a new task not in the list

If there are more than 4 tasks, show the top 4 by priority and mention how many more exist.

### 5. Set up the chosen task

Once the developer picks a task:

- Create a feature branch from the default branch:

```bash
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")
git checkout "$DEFAULT_BRANCH"
git pull origin "$DEFAULT_BRANCH" 2>/dev/null || true
git checkout -b feat/<task.id>-<short-kebab-description>
```

- Write the active task file:

```bash
REPO_PATH=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat > ~/.claude/tandemu-active-task.json << EOF
{
  "taskId": "<task.id>",
  "title": "<task.title>",
  "startedAt": "$NOW",
  "repos": ["$REPO_PATH"],
  "provider": "<task.provider>",
  "url": "<task.url>"
}
EOF
```

- Update the task on the ticket system — set status to "in progress" AND assign it to the current developer. First fetch the available statuses, then pick the one that best represents "in progress":

```bash
# Fetch available statuses for this task
curl -sf -H "Authorization: Bearer <token>" "<api_url>/api/tasks/<task.id>/statuses?provider=<task.provider>"
```

This returns an array of `{ id, name, type }` objects — the actual statuses available in the team's workflow (e.g., "Backlog", "In Progress", "In Review", "Done"). Pick the one that best represents "in progress" or "started".

Then send a single PATCH to update both status and assignee. Read the developer's email from `~/.claude/tandemu.json` (`user.email`):

```bash
curl -sf -X PATCH "<api_url>/api/tasks/<task.id>" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"statusName": "<chosen status name>", "assigneeEmail": "<user.email>", "provider": "<task.provider>"}'
```

If you can't determine which status to use, still send the assignee update without statusName. The endpoint accepts any combination of the fields.

- If the task has a description, summarize what needs to be done
- Search the codebase for files relevant to the task title/description
- List the related files

### 6. Confirm readiness

```
Ready to work on: <task title>
Branch: feat/<task.id>-<description>
Task: <task.url>
Related files:
  - <list of relevant files>

Let's get started!
```

### Notes

- Tasks come from the Tandemu API, which proxies to the org's connected ticket system
- The developer may have multiple repos and sessions open — this skill only manages the current repo
- Always let the developer choose — never auto-assign
- If they select "Other", ask what they want to work on and create a branch for it
- The active task file at `~/.claude/tandemu-active-task.json` is shared across all Claude Code windows — only one task can be active at a time
- **IMPORTANT**: Always use `Bash` (cat, python3, etc.) to read and write `~/.claude/tandemu-active-task.json` — do NOT use the Edit or Write tools for this file
