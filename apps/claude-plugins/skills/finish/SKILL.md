---
name: finish
description: Mark the current task as done. Checks for uncommitted work, verifies the task is complete, compacts the conversation, and shows the updated task list with this task ticked off.
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Agent
  - WebFetch
  - AskUserQuestion
---

Help the developer wrap up their current task cleanly.

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
git log main..HEAD --oneline
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

### 4. Show the updated task list

Fetch the task list (same as /morning) and display it with the current task marked:

```
Task complete! Here's your updated board:

  [done] [#55] Add team member invite flow
  2. [#52] Friction heatmap empty state (medium)
  3. [#49] Update DORA metric calculations (low)

PRs in flight:
  [PR #56] Add team member invite flow — awaiting review

Would you like to start another task?
```

### 5. Switch back to main

If the developer is done with the task:

```bash
git checkout main
```

### Notes

- Never force-close or auto-merge anything — always ask
- If the developer says they're coming back to this task, don't mark it done
- The task list should reflect reality — pull from GitHub issues and Tandem API
- This skill can be invoked multiple times a day as the developer finishes tasks
