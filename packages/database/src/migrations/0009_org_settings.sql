-- Add settings JSONB column to organizations for org-level configuration (ROI params, etc.)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';
