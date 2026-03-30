# Audit: /docs/developer

**URL:** https://tandemu.dev/docs/developer

## Content Accuracy Issues

### 1. No significant accuracy issues
The overview is accurate and well-scoped. It correctly describes the three value props (memory, skills, telemetry) without overstepping.

### 2. Minor: Missing `/create` skill mention
The overview says "skills that replace ceremony" but only implies `/morning`, `/finish`, `/standup`. The `/create` skill (for creating new tickets from the terminal) is never mentioned in any developer docs page.

**Fix:** Add a mention: "When you discover work that needs tracking during coding, `/create` adds a new task to your ticket system without leaving the terminal."

## Rewriting Recommendations

### Structure is clean
Good landing page pattern — overview + links to sub-pages. Keep this structure.

### Suggested improvements:
1. **Add a "5-minute quickstart" block** — Condensed version of the full workflow:
   ```
   /morning → pick task → code → /finish → done
   ```
2. **Add a "What changes for you" comparison** — Before Tandemu vs After Tandemu, showing the ceremony reduction
3. **Add a note about privacy** — Developers care about monitoring. A brief "Tandemu captures session metadata, not prompt content or keystrokes" reassurance belongs here, not just on the lead page.
