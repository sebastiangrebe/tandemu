-- Allow multiple repo mappings per team per integration.
-- Old constraint: one mapping per (integration, team).
-- New constraint: one mapping per (integration, team, project).

ALTER TABLE integration_project_mappings
  DROP CONSTRAINT IF EXISTS integration_project_mappings_integration_id_team_id_key;

ALTER TABLE integration_project_mappings
  ADD CONSTRAINT integration_project_mappings_unique_mapping
  UNIQUE (integration_id, team_id, external_project_id);
