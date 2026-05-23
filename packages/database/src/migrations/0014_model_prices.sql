-- Model price table for agents that emit raw token counts (Codex CLI) but no
-- native USD cost field. Backend computes `cost = tokens × rate / 1M` at query
-- time, joining the agent's emitted `model` attribute against this table.
-- Claude Code and OpenCode emit pre-computed USD via `*.cost.usage` metrics
-- and bypass this table entirely; rows here are advisory for those agents.
--
-- Per-org overrides live in `organizations.settings.modelPriceOverrides` (the
-- existing JSONB column). PricingService reads the override first, falls back
-- to the row here.
--
-- Seeded rates are approximate as of 2026-05 and flagged `source = 'seed'`.
-- Admins should verify against provider pricing pages and update via the
-- `PATCH /api/admin/model-prices/:modelName` endpoint or direct SQL before
-- relying on cost reports for billing-grade accuracy.

CREATE TABLE IF NOT EXISTS model_prices (
  model_name        TEXT PRIMARY KEY,
  provider          TEXT NOT NULL,
  input_per_1m      NUMERIC(10, 4) NOT NULL,
  output_per_1m     NUMERIC(10, 4) NOT NULL,
  cached_per_1m     NUMERIC(10, 4),
  reasoning_per_1m  NUMERIC(10, 4),
  currency          TEXT NOT NULL DEFAULT 'USD',
  source            TEXT NOT NULL DEFAULT 'seed',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_prices_provider ON model_prices (provider);

INSERT INTO model_prices (model_name, provider, input_per_1m, output_per_1m, cached_per_1m, reasoning_per_1m) VALUES
  ('claude-opus-4-7',   'anthropic', 15.00, 75.00, 1.50, NULL),
  ('claude-sonnet-4-6', 'anthropic',  3.00, 15.00, 0.30, NULL),
  ('claude-haiku-4-5',  'anthropic',  1.00,  5.00, 0.10, NULL),
  ('gpt-5',             'openai',     5.00, 40.00, 0.50, 20.00),
  ('gpt-5-codex',       'openai',     5.00, 40.00, 0.50, 20.00),
  ('gpt-4o',            'openai',     2.50, 10.00, 0.25, NULL)
ON CONFLICT (model_name) DO NOTHING;
