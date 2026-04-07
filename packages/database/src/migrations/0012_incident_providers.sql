-- Add missing provider enum values for incident integrations.
-- asana/monday exist in TS type but were missing from Postgres enum.

ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'asana';
ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'monday';
ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'pagerduty';
ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'opsgenie';
