# Pricing

Server-side USD cost computation for agents that emit raw token counts.

## Why this exists

Claude Code and OpenCode emit `claude_code.cost.usage` / `opencode.cost.usage`
metrics pre-computed in USD client-side, so existing dashboards that read from
the `otel_metrics_sum` table see real cost rows directly.

Codex CLI does **not** emit a USD cost field. It emits raw token counts on
`codex.sse_event` log events (input/output/cached/reasoning). To show Codex
cost on the same per-day / per-developer / per-task dashboards, the backend
has to derive USD = `tokens × $/1M-tokens` at query time. This module owns
that calculation.

## Resolution order

For every cost query that needs to convert tokens → USD for a given model:

1. **Per-org override.** `organizations.settings.modelPriceOverrides[modelName]`
   (existing JSONB column, no schema change). Edited via the standard
   `PATCH /api/organizations/:id` endpoint with `settings.modelPriceOverrides`
   in the body. Useful for teams on enterprise contracts with custom rates.

2. **Global default.** Row in the `model_prices` Postgres table seeded by
   migration `0014_model_prices.sql`. Editable via the admin endpoint or
   direct SQL.

3. **No price found.** Returns `null` from `getModelPrice`. `computeCost`
   returns `0` and logs a one-time warning per model name so missing rates
   surface during testing.

## Schema

```sql
CREATE TABLE model_prices (
  model_name        TEXT PRIMARY KEY,
  provider          TEXT NOT NULL,             -- anthropic | openai | google | ...
  input_per_1m      NUMERIC(10, 4) NOT NULL,
  output_per_1m     NUMERIC(10, 4) NOT NULL,
  cached_per_1m     NUMERIC(10, 4),            -- nullable: not all models offer cache discount
  reasoning_per_1m  NUMERIC(10, 4),            -- nullable: only reasoning models
  currency          TEXT NOT NULL DEFAULT 'USD',
  source            TEXT NOT NULL DEFAULT 'seed',  -- seed | admin | fetcher
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Seed accuracy

The values shipped by `0014_model_prices.sql` are **approximate as of 2026-05**
and flagged `source = 'seed'`. They will go out of date as providers adjust
pricing. Run this check before relying on cost reports:

```sql
SELECT model_name, provider, input_per_1m, output_per_1m, updated_at
FROM model_prices
WHERE source = 'seed';
```

…and compare against the provider's pricing page. Update via:

```bash
curl -X PATCH \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"inputPer1M": 6.00}' \
  https://api.tandemu.dev/api/admin/model-prices/gpt-5
```

The PATCH endpoint marks the row `source = 'admin'` and invalidates the
in-process cache so the new rate is visible on the next cost query.

## Adding a new model

1. Find the provider's published rates (input/output/cached/reasoning per 1M).
2. Insert a row:

   ```sql
   INSERT INTO model_prices
     (model_name, provider, input_per_1m, output_per_1m, cached_per_1m, reasoning_per_1m, source)
   VALUES
     ('new-model-name', 'openai', 3.00, 12.00, 0.30, NULL, 'admin');
   ```

   Or call `PATCH /api/admin/model-prices/new-model-name` after running an
   `INSERT … ON CONFLICT DO NOTHING` migration for the seed.

## Caching

`PricingService` caches the global table in-process for 5 minutes. The TTL is
fine for usage where rates rarely change. Admin `PATCH` calls invoke
`invalidate()` synchronously so editors see their own changes immediately.

## What's not in v0.7

- **Historical pricing.** A rate change today applies retroactively to past
  metric rows in cost queries. Rates effective from past dates require an
  `effective_from` column + JOIN on `Timestamp` ranges; deferred.
- **Frontend admin UI.** Use `PATCH /api/admin/model-prices/:modelName` or SQL.
- **Automated fetcher.** A scheduled job that polls provider pricing pages
  and updates rows automatically. Defer until the manual maintenance burden
  becomes painful.
- **Multi-currency.** Schema has a `currency` column but conversion logic
  treats everything as USD. Adding FX rates is a separate feature.
