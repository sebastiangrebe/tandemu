# Audit: /docs/self-hosting

**URL:** https://tandemu.dev/docs/self-hosting

## Content Accuracy Issues

### 1. Service count says seven but lists eight
> "The stack runs seven services"

The page then lists: NestJS backend, Next.js frontend, PostgreSQL, ClickHouse, Redis, OTel Collector, MCP memory server. That's seven. But docker-compose.yml also includes `mem0_store` (Qdrant) as a separate service, making it eight.

**Fix:** Update to eight services and include Qdrant in the list.

### 2. Resource requirements
> "4GB RAM minimum"

**Problem:** This may be optimistic. ClickHouse + PostgreSQL + Qdrant + Redis + Node.js backend + Next.js frontend + OTel collector + OpenMemory — all running simultaneously. 4GB might work for a small team but could be tight.

**Fix:** "4GB RAM minimum for small teams (1-5 developers). 8GB recommended for larger deployments."

### 3. "No gated features, usage limits, or license restrictions" — Verified
> "The open-source version includes no gated features"

**Verified.** Searched the codebase for feature gates, billing gates, plan checks, subscription checks — none found. Stripe billing and Sentry exist in the code but are conditionally initialized (SaaS only) and don't gate any features. The claim is accurate.

### 4. Missing: Qdrant in the service list
The overview mentions OpenMemory MCP but not the Qdrant vector store it depends on.

**Fix:** Add: "Qdrant vector store — Powers the memory server's semantic search"

## Rewriting Recommendations

### Decent overview, needs more
This page correctly serves as a landing page for the self-hosting section.

### Suggested improvements:
1. **Add a system requirements table** — CPU, RAM, disk, OS, Docker version
2. **Add a "Self-hosted vs Cloud" comparison** — What's the same, what's different
3. **Add backup and disaster recovery guidance** — How to back up PostgreSQL and ClickHouse data
4. **Add a "Security considerations" section** — What to configure for production (JWT secret, CORS, HTTPS proxy, firewall rules)
5. **Add upgrade path documentation** — How to upgrade to new versions without data loss
