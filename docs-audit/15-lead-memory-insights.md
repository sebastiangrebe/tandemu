# Audit: /docs/lead/memory-insights

**URL:** https://tandemu.dev/docs/lead/memory-insights

## Content Accuracy Issues

### 1. Knowledge Gaps — Fully accurate
Cross-referencing git activity with memory coverage, folder-level aggregation, surfacing in `/morning` — all verified against the codebase. The explanation of how gaps work and why they matter is excellent.

### 2. Most Referenced — Accurate
Memory access tracking and surfacing of top-used memories — verified.

### 3. Cleanup Candidates — Accurate
7-day exclusion for recently created memories — verified.

### 4. Memory Health Score — Accurate
Formula and thresholds (80%+, 50-80%, below 50%) are documented. The note about new teams starting at 0% is helpful.

### 5. No issues found
This page is accurate and well-written. It matches the actual implementation exactly.

## Rewriting Recommendations

### This is a model docs page
Clear structure, explains concepts and actions, honest about limitations. Use this as the template for other pages.

### Suggested improvements:
1. **Add screenshots** — Show each insight card as it appears on the dashboard
2. **Add a "Memory maintenance checklist"** — Weekly/monthly tasks for keeping the knowledge base healthy:
   - Review cleanup candidates (weekly)
   - Check knowledge gaps after major refactors
   - Verify most-referenced memories are still accurate
3. **Add examples** — Show a real knowledge gap entry, a cleanup candidate, a most-referenced memory
4. **Cross-link to developer memory page** — Explain that developers can contribute to closing gaps by using `/finish` consistently
