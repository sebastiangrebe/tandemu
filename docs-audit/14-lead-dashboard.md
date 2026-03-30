# Audit: /docs/lead/dashboard

**URL:** https://tandemu.dev/docs/lead/dashboard

## Content Accuracy Issues

### 1. Dashboard Home KPI cards are accurate
The six KPI cards listed (Total Sessions, AI Code Ratio, Active Developers, Total Lines of Code, Avg Cycle Time, Tool Success Rate) match the actual `page.tsx` implementation exactly.

### 2. Charts & Tables list is accurate and comprehensive
Activity Chart, AI vs Manual Code donut, Tool Usage bar, Developer Activity leaderboard, Task Velocity, Investment Allocation, Hot Files, AI Effectiveness, Cost Metrics — all match the codebase.

### 3. Activity page description is accurate
Stats cards, activity chart, session log with developer names — matches the implementation.

### 4. DORA Metrics table is honest
> "Change Failure Rate — Not yet implemented (needs CI/CD integration)"
> "Time to Restore — Not yet implemented (needs CI/CD integration)"

**Good:** This page is honest about DORA limitations. But it contradicts the lead overview page which claims all four are calculated.

### 5. Missing: /insights page
The dashboard docs page doesn't mention the `/insights` page at all. This page exists and shows:
- Productivity Multiplier
- Capacity Freed
- Cost per Task
- Throughput chart
- Cost efficiency chart
- Token usage
- AI Adoption leaderboard

**Fix:** Add an "Insights" section between Activity and Friction Map.

### 6. Friction Map description is correct
Repository paths, prompt loop counts, error counts, color coding — all match.

### 7. Memory section correctly references sub-page
Links to `/docs/lead/memory-insights` for details. Good.

## Rewriting Recommendations

### Good reference page, needs visual polish
This is a solid reference but reads like a feature list. Professional docs would include:

### Suggested improvements:
1. **Screenshots for every section** — This is a dashboard docs page. Show the dashboard.
2. **Add "What to look for" guidance** — For each section, explain what healthy vs concerning data looks like:
   - AI Ratio: "40-70% is typical for teams actively using AI coding tools"
   - Friction: "Files with red indicators should be prioritized for refactoring"
3. **Add the /insights page** — It's a significant feature that's completely undocumented
4. **Add filter documentation** — The time range and team filters affect every page. Document the available ranges and how team filtering works.
5. **Add a "Dashboard walkthrough" guide** — Step-by-step "here's what to look at in your first week"
