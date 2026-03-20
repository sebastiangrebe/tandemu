---
name: morning
description: Start your work session. Fetches your assigned tasks from the Tandem API (which proxies your team's ticket system — Jira, Linear, ClickUp, or GitHub Issues), shows a priority-sorted list, and lets you pick what to work on.
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

### 1. Load Tandem config

Read `~/.claude/tandem.json`:

```bash
cat ~/.claude/tandem.json
```

Extract `auth.token`, `api.url`, `organization.id`, and `team.id`.

If the file doesn't exist, tell the developer: "Tandem is not configured. Run /tandem to set it up."

### 2. Fetch tasks from Tandem

Call the unified tasks endpoint. Tandem proxies to whatever ticket system the org has connected (Jira, Linear, ClickUp, or GitHub Issues):

```bash
curl -sf -H "Authorization: Bearer <token>" "<api_url>/api/tasks?sprint=current&teamId=<team_id>"
```

The response is `{ success, data: Task[] }` where each task has: `id`, `title`, `description`, `status`, `priority`, `assigneeName`, `labels`, `sprint`, `url`, `provider`.

Filter to tasks that are `todo` or `in_progress` status.

If the API returns an empty array or errors, tell the developer: "No tasks found. Your team may not have a ticket system connected yet — ask your admin to set one up at the Tandem dashboard (Integrations page)."

### 3. Let the developer pick a task

Use AskUserQuestion to present the tasks as a selectable list:
- Question: "What would you like to work on?"
- Header: "Tasks"
- Options: build dynamically from the fetched tasks (max 4, prioritized by: urgent > high > medium > low). Each option:
  - Label: the task title (truncated to fit)
  - Description: `<task.id> · <priority> · <provider>` (e.g., "TAND-42 · high · jira")
- The user can select "Other" to describe a new task not in the list

If there are more than 4 tasks, show the top 4 by priority and mention how many more exist.

### 4. Set up the chosen task

Once the developer picks a task:

- Create a feature branch from the default branch:

```bash
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")
git checkout "$DEFAULT_BRANCH"
git pull origin "$DEFAULT_BRANCH" 2>/dev/null || true
git checkout -b feat/<task.id>-<short-kebab-description>
```

- If the task has a description, summarize what needs to be done
- Search the codebase for files relevant to the task title/description
- List the related files

### 5. Confirm readiness

```
Ready to work on: <task title>
Branch: feat/<task.id>-<description>
Task: <task.url>
Related files:
  - <list of relevant files>

Let's get started!
```

### Notes

- Tasks come from the Tandem API, which proxies to the org's connected ticket system
- The developer may have multiple repos and sessions open — this skill only manages the current repo
- Always let the developer choose — never auto-assign
- If they select "Other", ask what they want to work on and create a branch for it
