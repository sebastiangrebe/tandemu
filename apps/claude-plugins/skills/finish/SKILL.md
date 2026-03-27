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

Load config and active task in a **single Bash call** ("Prepare telemetry"):

```bash
# Load Tandemu config
source ~/.claude/lib/tandemu-env.sh 2>/dev/null || source "$(git rev-parse --show-toplevel 2>/dev/null)/apps/claude-plugins/lib/tandemu-env.sh"
echo "---CONFIG---"
echo "TOKEN=$TANDEMU_TOKEN"
echo "API=$TANDEMU_API"

# Active task metadata
echo "---ACTIVE_TASK---"
cat ~/.claude/tandemu-active-task.json 2>/dev/null || echo "NONE"
```

Extract `taskId`, `title`, `startedAt`, `repos`, `category`, `labels` from the active task.

#### 4a. Collect raw git data across all repos

For each repo in the `repos` array, collect the raw data that the backend needs:

```bash
DEFAULT_BRANCH=$(git -C <repo> symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
[ -z "$DEFAULT_BRANCH" ] && DEFAULT_BRANCH=$(git -C <repo> branch -r 2>/dev/null | sed 's/^[* ]*//' | grep -E '^origin/(main|master|develop)$' | head -1 | sed 's@^origin/@@')
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"

# Per-file additions and deletions
git -C <repo> diff $DEFAULT_BRANCH...HEAD --numstat 2>/dev/null

# All commits with Co-Authored-By check
git -C <repo> log $DEFAULT_BRANCH..HEAD --format='%H|||%an|||%s|||%b' 2>/dev/null

# Changed file list
git -C <repo> diff $DEFAULT_BRANCH...HEAD --name-only 2>/dev/null
```

For each commit, check if the body contains `Co-Authored-By: Claude` (case-insensitive) and set `hasCoAuthorClaude: true/false`.

Build the request body from the collected data — do NOT calculate AI lines yourself.

#### 4b. Send to backend

**IMPORTANT: This call MUST succeed for /finish to complete. If it fails, tell the developer and STOP.**

```bash
RESULT=$(curl -sf -X POST "$TANDEMU_API/api/telemetry/tasks/<taskId>/finish" \
  -H "Authorization: Bearer $TANDEMU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "<provider>",
    "startedAt": "<startedAt>",
    "commits": [
      {"hash": "<hash>", "author": "<author>", "subject": "<subject>", "hasCoAuthorClaude": <true/false>}
    ],
    "files": [
      {"path": "<file>", "additions": <N>, "deletions": <N>}
    ],
    "changedFilesList": ["<file1>", "<file2>"],
    "category": "<category from active task>",
    "labels": ["<label1>", "<label2>"]
  }')
echo "$RESULT"
```

The backend handles:
- AI vs manual attribution (using native OTEL data when available, falling back to Co-Authored-By)
- OTLP telemetry submission (trace span + metrics)
- Returns: `{ aiLines, manualLines, totalCommits, durationSeconds, filesChanged }`

If the curl fails or returns an error, tell the developer and **STOP**.

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

Tell the developer (using values from the backend response):

```
Task completed: <title>
Duration: <durationSeconds formatted as Xh Ym>
Code: <aiLines> AI lines + <manualLines> manual lines (<totalCommits> commits, <filesChanged> files)
Telemetry: ✓ sent
```

### 5. Reflect and store memories

After measuring the work, store memories about this task. Do this silently — don't announce it.

**IMPORTANT: Always include metadata on every `add_memory` call.** This enables the dashboard to organize memories by repo, category, and task:

```
metadata: {
  repo: "<repo root path>",
  files: ["<relevant file paths>"],
  category: "<architecture|pattern|gotcha|preference|style|dependency|decision>",
  taskId: "<taskId from active task>"
}
```

Use the active task's `repos` array for the repo path, and the `changedFilesList` from the telemetry payload for relevant files.

**Store shared org memories** (pass `app_id: "org"` in the add_memory call — visible to all team members after task completes):
- What was accomplished: "Completed <taskId> — <brief description of what was built/fixed>" (category: `decision`)
- Key architecture decisions made during the task (category: `architecture`)
- New patterns or libraries introduced to the codebase (category: `pattern`)
- Known gotchas discovered in specific files or modules (category: `gotcha`)
- Dependency quirks or workarounds found (category: `dependency`)

**Store personal coding observations** (default user_id scope — only visible to this developer):
- Naming conventions the developer used or enforced (category: `style`)
- Error handling patterns observed (category: `pattern`)
- File organization choices (category: `preference`)
- Any corrections the developer made to your suggestions (category: `preference`)

**Store personal communication style** (if new patterns were noticed):

Review the developer's messages from this session. Look for persistent style patterns — NOT momentary mood. Only store if you noticed something new or different from what memory already has.

- Language formality level (casual/formal, slang, swearing)
- Recurring words or phrases they use (e.g., "dude", "sir", "lol", "LGTM")
- Message length preference (terse one-liners vs detailed explanations)
- How they give feedback (direct corrections vs suggestions vs questions)
- How they respond to your asides (engage? ignore? match humor?)

Store as: "Communication style: uses casual language, says 'dude', prefers short direct messages" (category: `preference`)
NOT as: "Was frustrated during task" or "Seemed tired today"

**Store personal observations (if any came up):**
- If the developer shared anything personal during the session (category: `preference`)
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
