# Audit: /docs/developer/memory

**URL:** https://tandemu.dev/docs/developer/memory

## Content Accuracy Issues

### 1. MCP config file path is wrong
> "registered in `~/.claude.json`"

Should be `~/.mcp.json`. The codebase migrated from the old location.

### 2. Auth description is incomplete
> "bearer token authentication"

This is only correct for Mem0 Cloud. OpenMemory (self-hosted) uses a user ID in the URL path for scoping, with no auth header. The docs should describe both backends since users choose between them.

### 3. Memory categories mismatch
The page describes four conceptual types (Personal Context, Coding DNA, Project Context, Task History). The dashboard uses a different taxonomy (architecture, pattern, gotcha, preference, style, dependency, decision). Both are valid but the docs should bridge the gap so users aren't confused when they see the dashboard.

### 4. Draft gating description is accurate
Drafts visible only to authors, promoted on task completion, deleted on cancellation. Correct.

### 5. Missing: How `/morning` uses memory
The page says `/morning` is "read-only" but doesn't explain that it actively searches for relevant context and checks for knowledge gaps.

## Rewriting Recommendations

This page tries to cover concept, architecture, dashboard, and management in one page without depth in any area.

1. **How Memory Works** — simple explanation for new users
2. **What Gets Remembered** — categories with examples
3. **Personal vs Organization Memory** — clear distinction, draft gating
4. **Interacting with Memory** — asking Claude about memories, correcting them, adding manually
5. **Memory in Your Workflow** — how `/morning` and `/finish` use memory
6. **The Memory Dashboard** — link to memory-insights page or add screenshots
7. **Privacy** — what's stored, where, who can see it
