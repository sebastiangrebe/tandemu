# Audit: /docs/self-hosting/configuration

**URL:** https://tandemu.dev/docs/self-hosting/configuration

## Content Accuracy Issues

### 1. Migration list is incomplete
The page lists only 3 migrations but there are 10. Since migrations auto-apply on startup, the exact list isn't critical for users — but the page currently implies there are only 3 tables. Either remove the migration list entirely (they're auto-applied, users don't need to know) or keep it accurate.

### 2. API token encryption is undersold
> "API tokens for integrations are stored in PostgreSQL — consider encrypting at rest in production"

Tokens are already encrypted at rest using AES-256-GCM. The docs suggest this is something the user needs to set up — it's already done. Update to reflect this.

### 3. Environment variables table is incomplete
Missing critical variables:
- **`OPENAI_API_KEY`** — Required for memory embeddings. Without it, memory search silently fails. This is the most important omission.
- **`APP_URL` / `FRONTEND_URL`** — Used for redirects and OAuth callbacks
- **OAuth variables** (`GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`, etc.) — needed if offering social login

### 4. ClickHouse tables list is incomplete
Missing the `memory_access_log` table used for memory usage insights. It's auto-created on startup.

### 5. RLS documentation is good
Row-Level Security explanation is accurate and important. Keep it.

## Rewriting Recommendations

This is the page self-hosters reference constantly. Compared to Supabase or GitLab self-hosting docs:

1. **Complete environment variable reference** — every var, required/optional, default value
2. **Production hardening guide** — HTTPS via reverse proxy, changing JWT secret, firewall rules
3. **Backup procedures** — how to back up each data store
4. **Monitoring** — health endpoints, what to alert on
5. Remove implementation details users don't need (migration filenames, internal table schemas) — focus on what they need to configure and maintain
