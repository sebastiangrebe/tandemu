# Audit: /docs/introduction

**URL:** https://tandemu.dev/docs/introduction

## Content Accuracy Issues

### 1. DORA Metrics claim is misleading
> "DORA Metrics — Tracks deployment frequency, lead time, change failure rate, and time to restore"

**Problem:** Change failure rate and time to restore are not implemented. The `/dora-metrics` route was removed and redirects to `/`. Only deployment frequency (task completions/day) and lead time (avg cycle time) exist, and these are approximations derived from task completions, not CI/CD data.

**Docs impact:** The docs claim all 4 DORA metrics. Only 2 are implemented (deployment frequency, lead time). CFR and MTTR require CI/CD integration that doesn't exist yet.

### 2. Architecture table has inaccuracies
> Memory: "Mem0 via MCP"

**Problem:** The actual setup uses OpenMemory MCP server (Docker container `mem0/openmemory-mcp`) with a Qdrant vector store. "Mem0 via MCP" is vague and doesn't reflect the architecture accurately.

**Fix:** Change to: "Memory | OpenMemory MCP + Qdrant | Persistent AI context across sessions"

### 3. Missing dashboard pages
The "What it does" section doesn't mention several key features that exist:
- `/insights` page (ROI metrics, productivity multiplier, capacity freed)
- `/activity` page (session tracking, developer time)
- AI Memory dashboard (`/memory`) with knowledge gaps, cleanup, and health scoring
- Investment allocation (feature vs bug vs debt breakdown)

**Fix:** Add these to the feature list or ensure they're covered elsewhere in the intro.

## Rewriting Recommendations

### Structure
The page is decent but reads like a README, not professional docs. Compare with Stripe's intro or Vercel's docs — they lead with a clear value proposition and a "get started in 60 seconds" CTA.

### Suggested rewrite structure:
1. **One-sentence hook** — "Tandemu is the management layer for AI-assisted software development."
2. **Two-paragraph explanation** — What it does, who it's for (keep current content, tighten)
3. **Visual architecture diagram** — Replace the table with an actual diagram (Mermaid or image)
4. **Quick start callout** — Prominent box: "Get started in 5 minutes → Installation Guide"
5. **Feature grid** — 6 cards with icons, not a bullet list

### Tone
Current tone is good — direct, no fluff. Keep it. But add more visual hierarchy. The wall of bullets in "What it does" needs icons or cards.

### Missing
- No mention of the plugin marketplace installation path (the primary install method)
- No mention of OSS vs SaaS distinction in the intro
- "Next steps" links are good but should include the Developer Guide for devs landing here
