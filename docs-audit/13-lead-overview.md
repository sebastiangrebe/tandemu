# Audit: /docs/lead

**URL:** https://tandemu.dev/docs/lead

## Content Accuracy Issues

### 1. DORA Metrics claim is wrong
> "DORA Metrics — Includes deployment frequency, lead time for changes, change failure rate, and mean time to restore. Calculated from task completions and telemetry data without requiring CI/CD pipeline integration."

**Problem:** CFR and MTTR are NOT implemented. The page claims they're "calculated from task completions" — this is false. They show as zero. The What Gets Measured page correctly states they need CI/CD integration, but this overview page contradicts that.

**Docs impact:** Page claims all 4 DORA metrics are "calculated from task completions and telemetry data without requiring CI/CD pipeline integration." CFR and MTTR are not implemented — this directly contradicts the What Gets Measured page which is honest about it.

### 2. Dashboard sections listed don't match reality
The page lists four categories: AI Insights, Friction Map, DORA Metrics, Passive Timesheets.

The actual dashboard has: Dashboard (`/`), Activity (`/activity`), Insights (`/insights`), Friction Map (`/friction-map`), AI Memory (`/memory`).

There is no separate "DORA Metrics" page or "AI Insights" page — those were old routes that now redirect to `/`.

**Fix:** Update to reflect actual pages: Dashboard (KPIs, charts, velocity), Activity (sessions, time tracking), Insights (ROI, AI investment value), Friction Map (hotspots), AI Memory (knowledge base).

### 3. "Passive Timesheets" naming
> "Session time captured automatically from Claude Code sessions, including duration, active time, and idle detection."

**Problem:** "Idle detection" is not implemented. The system measures time from `/morning` to `/finish`, not actual idle vs active within a session.

**Fix:** Remove "idle detection": "Session time captured automatically — duration measured from task start to completion."

### 4. Navigation links don't match actual sub-pages
> Links to: Dashboard Overview, Managing Teams, Integrations, Understanding Telemetry

**Missing:** Memory Insights page link (which exists at `/docs/lead/memory-insights`).

## Rewriting Recommendations

### Needs a significant update
This page is out of date with the actual product. It describes an older version of the dashboard.

### Suggested rewrite:
1. **Lead with the value prop** — "See how your team uses AI without asking them to report anything"
2. **Show each dashboard page** with a screenshot and one-sentence description
3. **Add a "Getting started as a lead" section** — What to look at first, how to interpret the metrics
4. **Fix the navigation** — Include Memory Insights in the sub-page links
5. **Remove or qualify DORA claims** throughout
