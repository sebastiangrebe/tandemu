# Audit: /docs/setup

**URL:** https://tandemu.dev/docs/setup

## Content Accuracy Issues

### 1. Member role description is wrong
> "Member — Read-only access to view dashboard and use Claude Code skills"

**Problem:** Members can do more than read-only dashboard access. They can use all Claude Code skills, create memories (personal), and have full developer functionality. "Read-only" is misleading — it's more like "cannot manage org settings."

**Fix:** "Member — Full developer access (skills, memory, dashboard). Cannot manage teams, integrations, or billing."

### 2. Team creation during setup has a known bug
> "Step 3: Create Teams (optional)"

**Problem:** The setup wizard's team creation silently fails because the JWT at that point has MEMBER role with no org context, but the teams endpoint requires OWNER/ADMIN. The docs describe team creation as a working setup step, but it doesn't work.

**Docs impact:** Either the wizard needs fixing so the docs are accurate, or the docs should remove team creation from the setup flow and direct users to the Teams page instead.

### 3. MCP config file location inconsistency
> "Memory — OpenMemory MCP server in `~/.mcp.json`"

**Correct here**, but the Developer Memory page says `~/.claude.json`. The codebase has migrated to `~/.mcp.json`. Ensure all pages are consistent.

## Rewriting Recommendations

### Structure
This page covers too many things: registration, org setup, integrations, AND Claude Code connection. Consider splitting:

1. **Account Setup** — Register, create org, invite members
2. **Integration Setup** — Connect ticket systems (or just link to the integrations page)
3. **Developer Setup** — Connect Claude Code (or just link to the connecting page)

### Suggested improvements:
1. **Add screenshots** — Registration form, org creation wizard, integration connection. Every professional doc site has these.
2. **Add a "What you'll need" checklist** at the top — Account credentials, ticket system API token, team member emails
3. **Add success indicators** — "You'll know setup is complete when you see the dashboard with your organization name in the header"
4. **Separate SaaS vs self-hosted paths** — The page assumes self-hosted (localhost URLs) but SaaS users hit tandemu.dev. Add a toggle or note.
