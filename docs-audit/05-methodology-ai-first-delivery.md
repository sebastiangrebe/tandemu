# Audit: /docs/methodology/ai-first-delivery

**URL:** https://tandemu.dev/docs/methodology/ai-first-delivery

## Content Accuracy Issues

### 1. No significant accuracy issues
This page is conceptual/philosophical rather than technical, so there's less to get wrong. The developer's day table showing multiple task completions per morning is realistic given the architecture.

### 2. Minor: "What This Isn't" section could be stronger
> "AI agents cannot... Navigate organizational politics"

**Problem:** This is filler. Replace with more substantive limitations like "evaluate security implications of generated code" or "understand business context beyond what's in the ticket."

## Rewriting Recommendations

### Structure is good but could be more impactful
The Old Loop → AI-First Loop comparison is effective. The "Developer's Day" table is a nice touch.

### Suggested improvements:
1. **Add before/after metrics** — Even hypothetical: "A team shipping 2 tasks/week per developer typically sees 6-8 tasks/week after adopting AI-first delivery"
2. **Add the "Director" metaphor earlier** — The implementer-to-director shift is the key insight but it's buried in the middle
3. **Add a "Common Pitfalls" section** — What goes wrong when teams adopt AI-first delivery poorly:
   - Over-relying on AI without reviewing output
   - Skipping the `/finish` step and losing telemetry
   - Using AI for tasks that need deep domain understanding
4. **Cross-link to the "What Gets Measured" page** — The metrics that validate whether AI-first delivery is working
