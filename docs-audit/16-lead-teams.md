# Audit: /docs/lead/teams

**URL:** https://tandemu.dev/docs/lead/teams

## Content Accuracy Issues

### 1. Roles table is accurate
Owner, Admin, Member permissions match the codebase. The distinction (Owner can delete org, Admin can't, Member can't manage anything) is correct.

### 2. Team-level reporting filters mention old page names
> "AI Insights → per-team AI usage"
> "Timesheets → per-team hours"

**Problem:** There is no "AI Insights" page or "Timesheets" page. These were old routes that redirect to `/`. The current pages are Dashboard, Activity, Insights, Friction Map, Memory.

**Fix:** Update to:
- "Dashboard → per-team KPIs and charts"
- "Activity → per-team session data"
- "Friction Map → per-team friction hotspots"

### 3. `/standup --team` reference
> `standup (/standup --team "Frontend")`

**Correct.** The standup skill does support the `--team` flag. Verified.

### 4. Missing: Team settings
The page doesn't mention `doneWindowDays` — a team-level setting that controls how long completed/cancelled tasks remain visible (default: 14 days). This affects task filtering on the dashboard and in `/morning`.

**Fix:** Add a "Team Settings" section documenting configurable options.

## Rewriting Recommendations

### Too brief
This page is very thin. For a page about team management, it should cover:

### Suggested additions:
1. **Team settings reference** — doneWindowDays, any other team-level configs
2. **Project mapping** — How teams map to ticket system projects (currently on the Integrations page, but deserves mention here too)
3. **Multi-team scenarios** — How developers on multiple teams work, how filtering works
4. **Team deletion / member removal** — What happens to data?
5. **Screenshots** — Team management UI, member list, role assignment
