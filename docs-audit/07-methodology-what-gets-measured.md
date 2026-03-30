# Audit: /docs/methodology/what-gets-measured

**URL:** https://tandemu.dev/docs/methodology/what-gets-measured

## Content Accuracy Issues

### 1. DORA section is honest but should be the single source of truth
> "Change failure rate and time to restore — These metrics require integration with CI/CD pipelines and are not yet derived from Tandemu's task lifecycle."

This is honest and correct. But it contradicts other pages (Lead Overview, Lead Telemetry) that claim all 4 are calculated. This page should be the canonical DORA reference — all other pages should link here.

### 2. AI attribution is more accurate than described
The docs only describe `Co-Authored-By` commit attribution. The actual implementation has two tiers:
1. Native OTEL attribution with per-file AI line counts (preferred, more accurate)
2. `Co-Authored-By` fallback — proportional by commit ratio, not all-or-nothing

The docs undersell the attribution accuracy.

### 3. Session count terminology is ambiguous
> "Number of task sessions per developer per day"

In Tandemu, a "session" is a task session (`/morning` to `/finish`), not a Claude Code conversation. Multiple Claude Code conversations can happen within one task session. The docs should clarify this.

### 4. Missing metrics
The page covers about 60% of what Tandemu actually measures. Missing:
- **Investment Allocation** — time by task category (feature/bugfix/debt)
- **AI Effectiveness** — survival rate of AI-generated lines
- **Cost Metrics** — engineering cost estimates
- **Developer Stats** — per-developer breakdowns
- **Hot Files** — most-changed files
- **Tool Usage** — tool call patterns and success rates

This is supposed to be the definitive metrics reference — it should cover everything.

### 5. Friction severity thresholds are wrong
> "High: 10+ prompt loops or 5+ errors across multiple sessions"

The actual implementation uses a weighted score: `promptLoops + (errors × 2)`. High = score >= 20, Medium = score >= 10, Low = below 10. Three levels only. The Lead Telemetry page has yet another set of wrong numbers.

## Rewriting Recommendations

This should be the metrics bible — the one page everyone links to.

1. **Add the missing metrics** — cover everything the product actually measures
2. **Fix severity thresholds** — use the real formula
3. **Explain both attribution tiers** — native OTEL and Co-Authored-By fallback
4. **Add a quick-reference table** at the top — metric name, what it measures, where it appears
5. **"What's NOT Measured"** section is excellent — keep it
