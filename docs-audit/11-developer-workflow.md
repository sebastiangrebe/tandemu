# Audit: /docs/developer/workflow

**URL:** https://tandemu.dev/docs/developer/workflow

## Content Accuracy Issues

### 1. Workflow is accurate
The `/morning` → work → `/finish` flow with worktree creation, multi-task parallel support, and pause/resume all match the actual implementation.

### 2. Multi-repo tracking is accurate
> "Run `/finish` from the worktree — it measures work across all tracked repos"

Verified. The `/finish` skill iterates over all repos in the active task file and collects git data from each.

### 3. "End of Day" section is accurate
All listed metrics (active hours, tasks, AI ratio, friction events) are real dashboard features.

### 4. Missing: What happens when things go wrong
No coverage of error scenarios: API unreachable during `/finish`, OTEL collector down, no uncommitted changes. These are real situations developers will encounter.

## Rewriting Recommendations

This is the best developer docs page — clear, practical, shows real terminal output.

1. **Add a "Resuming a paused task" section** — how to get back to a paused worktree
2. **Add common scenarios** — quick fix on main while mid-task, starting work without `/morning`, discovering untracked work
3. **Add animated terminal recordings** — tools like asciinema would make this more engaging
4. **Add a visual flowchart** of the morning → work → finish cycle
