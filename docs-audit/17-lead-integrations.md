# Audit: /docs/lead/integrations

**URL:** https://tandemu.dev/docs/lead/integrations

## Content Accuracy Issues

### 1. ClickUp mapping description is correct
> "ClickUp uses API Token authentication and maps Folders to teams (including all lists/sprints)."

Verified: CLAUDE.md confirms "ClickUp `fetchProjects` returns folders (not individual lists) as mappable entities. `fetchTasks` auto-detects whether the mapped ID is a folder or list."

### 2. "Tandemu never stores your tasks" — Correct
Real-time API proxying is the actual architecture. No task caching. Good.

### 3. Status normalization claim
> "The system normalizes external statuses into a unified format: `todo`, `in_progress`, `in_review`, `done`, and `cancelled`."

**Problem:** The CLAUDE.md says "No hardcoded status mappings. Skills fetch available statuses from the ticket system, then Claude picks the best match." These seem contradictory — is there normalization or dynamic matching?

**Fix:** Clarify: "For display purposes, Tandemu normalizes statuses into categories (todo, in_progress, in_review, done, cancelled). When updating a task, skills dynamically fetch available statuses from your ticket system and pick the best match — no hardcoded mappings required."

### 4. Token storage security
> The page doesn't mention that API tokens are encrypted at rest.

**Problem:** The codebase has AES-256-GCM encryption via `crypto.ts`. This is a security feature worth documenting — it reassures security-conscious leads.

**Fix:** Add: "API tokens are encrypted at rest using AES-256-GCM before storing in PostgreSQL."

### 5. Missing: OAuth integration path
The page only describes API token connections. If OAuth is supported (or planned) for any provider, it should be mentioned.

## Rewriting Recommendations

### Decent but needs more depth

### Suggested improvements:
1. **Per-platform setup guides** — Each integration should have its own expandable section with:
   - Step-by-step token creation (with screenshots)
   - Required scopes/permissions
   - What data Tandemu reads (tasks, statuses, assignees — NOT code)
   - Common issues and solutions
2. **Add a "What data does Tandemu access?" section** — Reassure users that Tandemu reads task metadata only, not source code or conversations
3. **Add project mapping examples** — Show the mapping UI, explain what happens when mappings change
4. **Add a troubleshooting section** — Token expired, wrong permissions, rate limiting
5. **Mention encryption** — API tokens encrypted at rest is a selling point
