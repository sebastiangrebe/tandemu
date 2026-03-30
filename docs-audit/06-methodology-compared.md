# Audit: /docs/methodology/compared

**URL:** https://tandemu.dev/docs/methodology/compared

## Content Accuracy Issues

### 1. Standup skill reference is correct
> "/standup generates a team report from real data"

Verified: `/standup` exists, supports `--team` flag, and generates reports from telemetry + ticket data.

### 2. "DORA metrics" mentioned in Sprint Review suggestion
> "Use Tandemu's dashboard to show what was delivered, AI ratio, and cycle times."

**Problem:** This is fine because it doesn't claim all 4 DORA metrics. But the lead overview page does claim "DORA Metrics" as a dashboard section, which is misleading. Cross-page consistency needed.

### 3. Migration path is realistic
The 4-week adoption plan is practical and matches how the product actually works. No accuracy issues.

## Rewriting Recommendations

### This is one of the best docs pages
It's well-structured, honest, and practical. The Scrum/Kanban comparison tables are excellent. The migration path is actionable.

### Suggested improvements:
1. **Add a "With SAFe" row** — Enterprise teams using SAFe would benefit from seeing how Tandemu fits into their PI planning cadence
2. **Add testimonials or case studies** — Even one real example of a team that transitioned would make this page much stronger
3. **The "Zero ceremony overhead" section** should mention `/create`** — For when developers discover work during coding that needs a new ticket
4. **Add a comparison table with competing tools** — LinearB, Sleuth, Jellyfish, Faros AI. What does Tandemu do that they don't? This is the page where buyers compare.
