# Audit: /docs/methodology

**URL:** https://tandemu.dev/docs/methodology

## Content Accuracy Issues

### 1. DORA claim is overstated
> "'Deployment frequency' in DORA terms equals your team's task completion rate. Lead time is wall-clock time from `/morning` to `/finish`. No CI/CD integration needed for baseline metrics."

**Problem:** This is honest about the proxy (tasks = deployments), but calling it "DORA" without qualification is misleading. The methodology page should be upfront that this is a DORA-inspired approximation, not standard DORA measurement.

**Fix:** Add a qualifier: "Tandemu approximates two of the four DORA metrics using task completion data. This gives teams a starting point without CI/CD integration, though the numbers aren't directly comparable to traditional DORA benchmarks."

### 2. Everything else is accurate
The core methodology (one task at a time, `/morning` to `/finish`, AI attribution via Co-Authored-By, observability without surveillance) matches the actual implementation. The principles section is well-written and honest.

## Rewriting Recommendations

### This is the strongest docs page
The methodology page is genuinely good — clear thesis, practical principles, honest about limitations. It reads like thought leadership, not filler.

### Suggested improvements:
1. **Add a visual** — The `/morning → pick a task → work with AI → /finish → metrics captured` flow would benefit from a diagram
2. **Add real examples** — "Here's what a team of 5 developers saw after 2 weeks with Tandemu" (even if simulated, showing the dashboard with realistic data would help)
3. **Link to blog posts** — The methodology pages could reference the existing blog content (ai-first-delivery-metrics, developer-friction-without-surveillance)
4. **Add a "Frequently Asked Questions" section** — Anticipate objections:
   - "Does one-task-at-a-time work for interrupt-driven teams?"
   - "What if developers forget to run /finish?"
   - "How accurate is the AI ratio really?"
