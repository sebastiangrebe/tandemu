-- Add per-org ingestion key for OTEL telemetry authentication
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ingestion_key UUID DEFAULT gen_random_uuid() NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_ingestion_key ON organizations (ingestion_key);
