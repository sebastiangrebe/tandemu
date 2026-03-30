# Audit: /docs/developer/skills

**URL:** https://tandemu.dev/docs/developer/skills

## Content Accuracy Issues

### 1. Says "five integrated skills" but only documents four
> "Tandemu provides five integrated skills for Claude Code"

**Problem:** The page documents `/morning`, `/pause`, `/finish`, `/standup` — that's four. The fifth is likely `/create` (which exists in the skills directory and is installed by install.sh). `/setup` also exists as a skill but is admin-facing.

**Fix:** Add a `/create` section and update the count to match.

### 2. `/morning` description is accurate and detailed
The worktree creation, priority sorting, knowledge gap checking, and multi-task support all match the actual SKILL.md implementation. Good.

### 3. `/finish` memory storage description
> "Storing enriched memories with repo, file, and category metadata"

**Correct.** The `/finish` skill does enrich memories with `{ repo, files[], category, taskId, commitSha, prNumber, prUrl }` metadata.

### 4. `/standup` description is too brief
> "Reports include summary stats, per-person updates matched by email, contributor information, and top unstarted backlog items"

**Missing:** The `--team` and `--format` flags are not mentioned. The standup skill supports `--team <team-name>` for team-specific reports and `--format <slack|markdown|plain>` for output formatting.

**Fix:** Add argument documentation for `/standup`.

### 5. Missing: `/create` skill entirely
The `/create` skill exists in `apps/claude-plugins/skills/create/` and is installed by both the plugin and install.sh. It allows developers to create new tasks in their ticket system from the terminal.

**Fix:** Add a full section for `/create`.

## Rewriting Recommendations

### Structure needs work
Currently a flat list of skills with descriptions. Professional docs would have:

### Suggested rewrite structure:
1. **Quick reference table** at the top — Skill name, one-line description, when to use
2. **Each skill gets its own subsection** with:
   - Description
   - Usage: `/skillname [arguments]`
   - Arguments table (flags, options)
   - What it does (step by step)
   - Example output (what the developer sees)
   - Related skills
3. **"How Skills Work" section** — Current content about data flow and status sync is good, keep at the bottom

### Missing content:
- No example output for any skill (what does `/morning` actually show?)
- No argument/flag documentation
- No mention of `/create`
- No error scenarios (what happens if the API is unreachable?)
- No mention of how to customize skills or create your own
