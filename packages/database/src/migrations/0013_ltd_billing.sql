-- Lifetime Deal (LTD) tiers + generic resource caps.
-- OSS reads only the numeric caps (NULL = unlimited); the Platform billing
-- layer is the only writer. New enum values are declared here but MUST NOT be
-- referenced (no UPDATE) in this same migration file — the runner wraps each
-- file in a single transaction.

ALTER TYPE plan_tier ADD VALUE IF NOT EXISTS 'ltd_tier_1';
ALTER TYPE plan_tier ADD VALUE IF NOT EXISTS 'ltd_tier_2';
ALTER TYPE plan_tier ADD VALUE IF NOT EXISTS 'ltd_tier_3';

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_seats      INTEGER;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_repos      INTEGER;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS retention_days INTEGER;
