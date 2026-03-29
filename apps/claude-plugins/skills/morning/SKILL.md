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
  - EnterPlanMode
---

Help the developer start their work session by picking a task.

**Execution style:** Minimize tool call noise. Combine pure-read infrastructure commands (config loads, active task reads, timestamp calculations) into as few Bash calls as possible with brief descriptions like "Setup". Keep user-facing operations (task selection, PR checks, summaries) as separate, clearly described calls.

## Steps

### 0. Greet personally (memory)

Before anything else, search memories for the developer's personal context — their name, what they were working on recently, any preferences. Use this to greet them personally.

If you know their name (from `~/.claude/tandemu.json` under `user.name`): "Morning, {{DEV_NAME}}. Let me pull up your tasks."
If you don't know their name yet: "Good morning! Let me get your tasks."

If you remember what they worked on recently, mention it: "Last time you were working on the invoice module — want to continue or pick something new?"

Do this naturally, don't announce you're searching memories.

### 1. Setup — load config, check active task, and check git state

Run all setup reads in a **single Bash call**:

```bash
# Load Tandemu config
source ~/.claude/lib/tandemu-env.sh 2>/dev/null || source "$(git rev-parse --show-toplevel 2>/dev/null)/apps/claude-plugins/lib/tandemu-env.sh"
echo "---CONFIG---"
echo "TOKEN=$TANDEMU_TOKEN"
echo "API=$TANDEMU_API"
echo "ORG=$TANDEMU_ORG_ID"
echo "TEAM=$TANDEMU_TEAM_ID"
echo "EMAIL=$TANDEMU_USER_EMAIL"
echo "NAME=$TANDEMU_USER_NAME"

# Check for active task
echo "---ACTIVE_TASK---"
cat ~/.claude/tandemu-active-task.json 2>/dev/null || echo "NONE"

# Git state
echo "---GIT---"
REPO=$(git rev-parse --show-toplevel 2>/dev/null)
echo "REPO=$REPO"
echo "STATUS=$(git status --short)"

# Local time context for accurate relative dates
echo "---LOCAL_TIME---"
echo "TZ=$(date +%Z)"
echo "OFFSET=$(date +%z)"
echo "LOCAL_NOW=$(date '+%Y-%m-%d %H:%M %Z')"
echo "LOCAL_TODAY=$(date +%Y-%m-%d)"
echo "LOCAL_YESTERDAY=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d 'yesterday' +%Y-%m-%d)"

# Refresh memory index for this repo
REPO_NAME=$(basename "$REPO" 2>/dev/null || echo "unknown")
echo "---MEMORY_INDEX---"
ETAG=$(cat ~/.claude/tandemu-memory-index-${REPO_NAME}.etag 2>/dev/null || echo "")
INDEX_RESPONSE=$(curl -sf -w "\n%{http_code}" \
  -H "Authorization: Bearer $TANDEMU_TOKEN" \
  -H "If-None-Match: $ETAG" \
  "$TANDEMU_API/api/memory/index?repo=$REPO_NAME" 2>/dev/null || echo -e "\n000")
HTTP_CODE=$(echo "$INDEX_RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "200" ]; then
  echo "$INDEX_RESPONSE" | sed '$d' > ~/.claude/tandemu-memory-index-${REPO_NAME}.md
  RESPONSE_ETAG=$(curl -sI -H "Authorization: Bearer $TANDEMU_TOKEN" "$TANDEMU_API/api/memory/index?repo=$REPO_NAME" 2>/dev/null | grep -i etag | tr -d '\r' | awk '{print $2}')
  echo "$RESPONSE_ETAG" > ~/.claude/tandemu-memory-index-${REPO_NAME}.etag
  echo "REFRESHED"
elif [ "$HTTP_CODE" = "304" ]; then
  echo "UNCHANGED"
else
  echo "SKIPPED (status: $HTTP_CODE)"
fi
```

If the config load fails, tell the developer: "Tandemu is not configured. Run install.sh to set it up."

### 2. Handle active task (if found)

If the active task JSON was returned (not "NONE"):

- Extract `taskId`, `title`, `startedAt`, `repos` from it.
- Calculate how long ago the task was started. **Use LOCAL_TODAY and LOCAL_YESTERDAY from setup to determine if the task was started "today" or "yesterday". Convert `startedAt` to the developer's local timezone (using the OFFSET from setup) before comparing dates. Do not rely on elapsed hours alone — a task started at 11 PM yesterday is "yesterday", not "11h ago".**
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
  - Skip to the readiness summary (Step 6).
- If they choose **Pause and pick another**: tell the developer to run `/pause` first, then `/morning` again. Stop here.

If no active task was found, proceed to Step 3.

### 3. Fetch tasks from Tandemu

Fetch tasks assigned to the current developer (use the config values from setup):

```bash
curl -sf -H "Authorization: Bearer $TANDEMU_TOKEN" "$TANDEMU_API/api/tasks?teamId=$TANDEMU_TEAM_ID&mine=true&sort=priority&order=desc"
```

The response is `{ success, data: Task[] }` where each task has: `id`, `title`, `description`, `status`, `priority`, `assigneeName`, `assigneeEmail`, `labels`, `url`, `provider`. **The API returns tasks already sorted by priority (urgent first).** Do not re-sort — use the response order as-is.

Filter to tasks that are `todo` or `in_progress` status.

If the developer has assigned tasks, proceed to Step 4 with those.

If no tasks are assigned to the developer, fetch **unassigned todo tasks** that they could pick up:

```bash
curl -sf -H "Authorization: Bearer $TANDEMU_TOKEN" "$TANDEMU_API/api/tasks?teamId=$TANDEMU_TEAM_ID&status=todo&unassigned=true&sort=priority&order=desc"
```

Tell the developer: "No tasks are assigned to you. Here are unassigned tasks you could pick up:"

If both calls return empty, tell the developer: "No tasks found. Your team may not have a ticket system connected yet — ask your admin to set one up at the Tandemu dashboard (Integrations page)."

### 4. Let the developer pick a task

Use AskUserQuestion to present the tasks as a selectable list:
- Question: "What would you like to work on?"
- Header: "Tasks"
- Options: take the **first 4 tasks** from the API response (already sorted by priority). Each option:
  - Label: the task title (truncated to fit)
  - Description: `<task.id> · <priority> · <provider>` (e.g., "TAND-42 · high · jira")
- The user can select "Other" to describe a new task not in the list

If there are more than 4 tasks, show the top 4 and mention how many more exist.

### 5. Set up the chosen task

Once the developer picks a task:

#### 5a. Check for uncommitted changes

Use the git status output from the setup call. If it showed uncommitted changes, use AskUserQuestion:
- Question: "You have uncommitted changes. What should I do before switching branches?"
- Header: "Changes"
- Options:
  - Label: "Commit on current branch", Description: "Stage and commit changes with a conventional commit message before switching"
  - Label: "Stash for later", Description: "Stash changes — you can restore them later with git stash pop"
  - Label: "Bring to new branch", Description: "Carry uncommitted changes into the new feature branch"

If **Commit**: help write a commit message based on the diff, stage and commit, then proceed.
If **Stash**: run `git stash push -m "WIP before <task.id>"`, then proceed.
If **Bring to new branch**: do nothing — changes will carry over when creating the branch.

If the working tree is clean, skip this step.

#### 5b. Create a feature branch

Detect the repo's default branch dynamically (supports main, master, develop, or whatever the remote uses):

```bash
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
if [ -z "$DEFAULT_BRANCH" ]; then
  # Fallback: check which common branch names exist on the remote
  DEFAULT_BRANCH=$(git branch -r 2>/dev/null | sed 's/^[* ]*//' | grep -E '^origin/(main|master|develop)$' | head -1 | sed 's@^origin/@@')
fi
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"
```

Then switch and create the feature branch:

```bash
git checkout "$DEFAULT_BRANCH"
git pull origin "$DEFAULT_BRANCH" 2>/dev/null || true
git checkout -b feat/<task.id>-<short-kebab-description>
```

- Write the active task file. Infer the task category from labels:
  - Labels containing "bug", "fix", "hotfix" → `bugfix`
  - Labels containing "feature", "enhancement" → `feature`
  - Labels containing "debt", "refactor", "chore" → `tech_debt`
  - Labels containing "maintenance", "ops", "infra" → `maintenance`
  - Default → `other`

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
  "url": "<task.url>",
  "category": "<inferred category>",
  "labels": [<task.labels as JSON array>]
}
EOF
```

- Update the task on the ticket system — set status to "in progress" AND assign it to the current developer. First fetch the available statuses, then pick the one that best represents "in progress":

```bash
# Fetch available statuses for this task
curl -sf -H "Authorization: Bearer $TANDEMU_TOKEN" "$TANDEMU_API/api/tasks/<task.id>/statuses?provider=<task.provider>"
```

This returns an array of `{ id, name, type }` objects — the actual statuses available in the team's workflow (e.g., "Backlog", "In Progress", "In Review", "Done"). Pick the one that best represents "in progress" or "started".

Then send a single PATCH to update both status and assignee:

```bash
curl -sf -X PATCH "$TANDEMU_API/api/tasks/<task.id>" \
  -H "Authorization: Bearer $TANDEMU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"statusName": "<chosen status name>", "assigneeEmail": "'"$TANDEMU_USER_EMAIL"'", "provider": "<task.provider>"}'
```

If you can't determine which status to use, still send the assignee update without statusName. The endpoint accepts any combination of the fields.

- If the task has a description, summarize what needs to be done
- **Search memories** for context relevant to the task: use `search_memories` with the task title and description. The memory index (loaded at setup) shows what's known — if it doesn't cover the modules this task touches, search beyond it. Include any relevant gotchas, architecture decisions, or patterns in the readiness summary.
- Search the codebase for files relevant to the task title/description
- List the related files

### 5c. Check for knowledge gaps (optional, don't block on failure)

After setting up the task, silently check for knowledge gaps:

```bash
GAPS=$(curl -sf -H "Authorization: Bearer $TANDEMU_TOKEN" "$TANDEMU_API/api/memory/gaps" 2>/dev/null)
```

If the response contains gaps (non-empty `gaps` array), include them in the readiness summary:

```
Knowledge gaps detected:
  ⚠ src/auth/ — 15 changes, 0 memories
  ⚠ src/telemetry/ — 12 changes, 1 memory
Consider documenting decisions in these areas during this session.
```

Only show the top 3 gaps. If the API call fails, skip silently — this is informational only.

### 6. Confirm readiness and choose approach

Show the readiness summary:

```
Ready to work on: <task title>
Branch: feat/<task.id>-<description>
Task: <task.url>
Related files:
  - <list of relevant files>
```

Then use AskUserQuestion to let the developer choose how to proceed:
- Question: "How would you like to approach this?"
- Header: "Approach"
- Options:
  - Label: "Plan first", Description: "Enter plan mode to design the implementation before writing code"
  - Label: "Manual", Description: "I'll drive — just give me the context and I'll prompt as I go"

If they choose **Plan first**: call `EnterPlanMode`. The developer can then give an initial prompt to guide the plan (e.g., "focus on the auth context first" or "keep it minimal"). Stop here — plan mode takes over.

If they choose **Manual**: say "All yours — let me know what you need." and stop. The developer will prompt from here.

**IMPORTANT: Do NOT start implementing the task during /morning.** This skill only handles setup: branch creation, ticket updates, codebase research, and readiness confirmation. Implementation happens after /morning completes, driven by the developer.

### Notes

- Tasks come from the Tandemu API, which proxies to the org's connected ticket system
- The developer may have multiple repos and sessions open — this skill only manages the current repo
- Always let the developer choose — never auto-assign
- If they select "Other", ask what they want to work on and create a branch for it
- The active task file at `~/.claude/tandemu-active-task.json` is shared across all Claude Code windows — only one task can be active at a time
- **IMPORTANT**: Always use `Bash` (cat, python3, etc.) to read and write `~/.claude/tandemu-active-task.json` — do NOT use the Edit or Write tools for this file
