-- Add settings JSONB column to teams for team-level configuration
ALTER TABLE teams ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';
