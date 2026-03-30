# Audit: /docs/self-hosting/docker

**URL:** https://tandemu.dev/docs/self-hosting/docker

## Content Accuracy Issues

### 1. Service list says seven, missing Qdrant
Same issue as the overview — lists 7 services but docker-compose.yml has 8 (Qdrant/mem0_store is missing).

**Fix:** Add Qdrant to the list.

### 2. Development mode command — Verified
> "Use `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`"

**Verified.** The dev override file exists and provides hot-reload for both backend and frontend. Accurate.

### 3. Volume list is accurate but incomplete
Lists four volumes: `postgres_data`, `clickhouse_data`, `redis_data`, `openmemory_data`.

**Problem:** docker-compose.yml also defines `qdrant_data` for the Qdrant vector store. Missing from the list.

**Fix:** Add `qdrant_data` — "Preserves vector embeddings for AI memory search"

### 4. Migration application — Verified
> "Database migrations apply automatically or manually via psql."

**Correct.** Migrations auto-apply on backend startup. The manual psql option is a fallback.

## Rewriting Recommendations

### Too brief for a Docker deployment guide
Compare with Supabase, Mattermost, or GitLab self-hosting docs. This page needs:

### Suggested additions:
1. **Full docker-compose.yml reference** — Show the actual file or link to it in the repo
2. **Port reference table** — All exposed ports and what they're for
3. **Environment variables** — Or clear link to the Configuration page
4. **Health check commands** — How to verify each service is running
5. **Log inspection** — How to debug common startup failures
6. **Reverse proxy setup** — nginx/Caddy/Traefik examples for HTTPS
7. **Resource monitoring** — How to check if the stack is healthy over time
8. **Scaling guide** — When to move to separate hosts, ClickHouse clustering for large teams
