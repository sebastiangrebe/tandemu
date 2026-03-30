# Audit: /docs/lead/telemetry

**URL:** https://tandemu.dev/docs/lead/telemetry

## Content Accuracy Issues

### 1. "Stealth observability" is undefined
> 'The platform implements "stealth observability"'

This term isn't used anywhere else. Replace with a clear description of what's collected and what's not.

### 2. Traces description is wrong
> "Traces: Session start/end, tool executions, deployment events"

"Deployment events" don't exist. There's no CI/CD integration. Traces contain task session spans, not deployment events.

### 3. Metrics description is wrong
> "Metrics: AI-generated lines, manual lines, token consumption"

"Token consumption" is not tracked as a metric. The telemetry sends line counts only.

### 4. DORA claims are wrong
> "DORA Metrics: The four metrics derive from telemetry"

Only two derive from telemetry. CFR and MTTR are not implemented. This contradicts the What Gets Measured page which is honest about it.

### 5. "Deployment frequency and failure rates" in tracked data
"Failure rates" are not tracked. Same DORA issue.

### 6. Friction severity levels are wrong
> "Severity levels range from Info (1 loop, green) to Critical (5+ loops or 3+ errors, red)"

The actual implementation uses three levels (not four) with a weighted score formula: errors count double. There is no "Info" or "Critical" level — it's Low, Medium, High. The What Gets Measured page has yet another set of wrong thresholds. All three sources disagree.

### 7. Data retention is partially wrong
> "Telemetry data in ClickHouse has a default 90-day TTL"

Only the memory access log table has a 90-day TTL. The core telemetry tables (traces, metrics, logs) created by the OTel collector have no TTL configured.

### 8. "Idle time NOT tracked" — Correct
Keep this. Important privacy statement.

## Rewriting Recommendations

This page has the most inaccuracies of any docs page. It needs a full rewrite.

1. **Accurate data collection list** — what's actually sent: task session spans, line count metrics, friction logs
2. **Privacy section** — what's NOT collected (keep and expand)
3. **Simple pipeline description** — Skills → OTel Collector → ClickHouse → Dashboard
4. **Correct data retention** — which tables have TTL, which don't
5. **Link to What Gets Measured** for the complete metrics reference
