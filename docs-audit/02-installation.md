# Audit: /docs/installation

**URL:** https://tandemu.dev/docs/installation

## Content Accuracy Issues

### 1. Setup step numbering says "restart Claude Code again"
> "Exit and reopen Claude Code, then execute `/tandemu:setup`. After setup completes, restart Claude Code again to activate the memory server."

**Problem:** This is two restarts. The actual flow from install.sh and plugin setup requires only one restart after setup completes (to pick up the MCP config in `~/.mcp.json`). The first "exit and reopen" before running setup may not be necessary with the plugin approach.

**Fix:** Clarify: "After plugin install, run `/tandemu:setup`. When setup completes, restart Claude Code once to activate the memory server." Do not remove the two restarts, add this as a note if the command does not show up.

### 2. Missing `/create` skill from the list
> "Install utility skills (`/morning`, `/finish`, `/pause`, `/standup`)"

**Problem:** The install script also installs `/create` (for creating new tasks) and `/setup`. The docs omit `/create` entirely across all pages.

**Fix:** Add `/create` to the skill list: "Install utility skills (`/morning`, `/finish`, `/pause`, `/standup`, `/create`)"

### 3. Database migration section is incomplete
> Shows running migrations with a for loop over `packages/database/src/migrations/*.sql`

**Problem:** This is fine technically, but the docs don't mention that there are 10 migrations, not just 3. If someone reads the Configuration page (which lists only 3), they might think something is wrong.

**Fix:** No change needed here (the glob catches all), but the Configuration page needs updating.

### 4. Missing prerequisite: Docker for OpenMemory/Qdrant
The "For Developers" prerequisites list `claude`, `python3`, and `curl` — but if they're connecting to a self-hosted instance, Docker isn't needed on their machine. This is correct. However, it should mention that the memory server requires Docker if running locally outside of the platform stack.

## Rewriting Recommendations

### Structure
The page correctly separates "For Developers" and "For Platform Administrators" — good pattern. But it could be more scannable.

### Suggested improvements:
1. **Add a prerequisites check block** — A copyable script that verifies all requirements:
   ```bash
   claude --version && python3 --version && curl --version
   ```
2. **Add expected output examples** — After each installation step, show what success looks like
3. **Add a "Verify installation" section** — How to confirm everything is working (run `/morning`, check memory with "What do you remember about me?")
4. **Troubleshooting section needs expansion** — Current page has basic troubleshooting but it's at the bottom of the Connecting page, not here. Installation troubleshooting should live on the installation page.

### Missing content
- No mention of updating an existing installation (version upgrades)
- `./install.sh --check` and `--uninstall` are mentioned but not explained in detail
- No mention of what happens if you have an existing `~/.mcp.json` or `~/.claude/settings.json` (the setup merges, but this isn't documented)
