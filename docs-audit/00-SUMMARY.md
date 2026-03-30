# Tandemu Documentation Audit — Summary

**Date:** 2026-03-29
**Pages audited:** 20 (all docs pages)
**New pages suggested:** 5

---

## Critical Issues

| Page | Issue |
|------|-------|
| **Lead Overview** (`/docs/lead`) | Claims all 4 DORA metrics are calculated — CFR and MTTR are not implemented |
| **Lead Telemetry** (`/docs/lead/telemetry`) | Claims "deployment events" and "token consumption" — neither exists |
| **Lead Telemetry** | Friction severity thresholds wrong and inconsistent with What Gets Measured page |
| **Developer Memory** (`/docs/developer/memory`) | Wrong MCP config file path (`~/.claude.json` → `~/.mcp.json`) |
| **Developer Memory** | Auth description only covers Mem0 Cloud, not OpenMemory (self-hosted) |
| **Configuration** (`/docs/self-hosting/configuration`) | Migration list is incomplete — only shows 3 of 10 |
| **Configuration** | Says API tokens aren't encrypted — they are |
| **Configuration** | Missing `OPENAI_API_KEY` from env vars — critical for memory to work |

## Moderate Issues

| Page | Issue |
|------|-------|
| **Introduction** (`/docs/introduction`) | DORA claim includes CFR/MTTR; architecture table is vague |
| **Setup** (`/docs/setup`) | Member role described as "read-only" — members have full developer access |
| **Setup** | Team creation during wizard doesn't work — docs describe it as a working step |
| **Lead Overview** | References old pages (AI Insights, Timesheets) that no longer exist |
| **Lead Overview** | Claims "idle detection" — not implemented |
| **Lead Dashboard** (`/docs/lead/dashboard`) | Missing the Insights page (`/insights`) entirely |
| **Lead Teams** (`/docs/lead/teams`) | References old page names |
| **Lead Telemetry** | "Stealth observability" — undefined term, not used anywhere else |
| **Self-Hosting Overview/Docker** | Lists 7 services — there are 8 (missing Qdrant) |
| **Developer Skills** (`/docs/developer/skills`) | Says "five skills" but only documents four; `/create` is missing |
| **What Gets Measured** | Missing 6+ metrics that exist in the product (investment allocation, AI effectiveness, cost, tool usage, hot files, developer stats) |
| **Connecting** (`/docs/developer/connecting`) | Token expiry says "24 hours" — actual expiry is 30 days |

## Pages with No Issues

| Page | Notes |
|------|-------|
| **Methodology** (`/docs/methodology`) | Strong, honest, well-written |
| **AI-First Delivery** (`/docs/methodology/ai-first-delivery`) | Conceptual, no issues |
| **Compared** (`/docs/methodology/compared`) | Excellent comparison tables, practical migration path |
| **Developer Overview** (`/docs/developer`) | Clean, accurate |
| **Workflow** (`/docs/developer/workflow`) | Best developer docs page |
| **Memory Insights** (`/docs/lead/memory-insights`) | Fully accurate |

---

## Cross-Cutting Quality Issues

### 1. DORA claims are inconsistent
Some pages claim all 4 metrics, some correctly say 2. Needs a single consistent position.

### 2. No screenshots
Zero visual documentation across 20 pages. Dashboard, Friction Map, Memory, and Insights are highly visual features.

### 3. Old page names persist
"AI Insights," "DORA Metrics page," and "Timesheets" appear across docs but these routes no longer exist.

### 4. `/create` skill is undocumented
Exists, is installed, lets developers create tickets from the terminal. Not mentioned anywhere.

### 5. No "Getting Started" tutorial
Reference pages exist but no guided walkthrough showing the full flow from install to first task completion.

### 6. ClickHouse data retention
Docs say 90-day TTL for all telemetry. Only the memory access log table has a TTL. Core telemetry tables have no TTL configured.

---

## Missing Pages

| Page | Priority | Why |
|------|----------|-----|
| **Troubleshooting** | High | Scattered across pages or missing entirely |
| **Security** | High | Required for enterprise evaluation |
| **Insights Page** (`/docs/lead/insights`) | Medium | Existing feature with zero documentation |
| **FAQ** | Medium | Common questions, good for SEO |
| **Changelog** | Medium | Self-hosters need to know what changed between versions |

---

## Competitive Gaps

Compared to LinearB, Sleuth, Jellyfish docs:

1. No video walkthroughs
2. No architecture diagrams — only text descriptions
3. No example dashboards showing real data
4. No comparison page ("Tandemu vs X")
5. No status page for SaaS reliability

---

## File Index

### Page audits (21 files):
`01-introduction.md` through `21-self-hosting-configuration.md`

### New page proposals (5 files):
- `NEW-PAGE-troubleshooting.md`
- `NEW-PAGE-security.md`
- `NEW-PAGE-insights-page.md`
- `NEW-PAGE-faq.md`
- `NEW-PAGE-changelog.md`
