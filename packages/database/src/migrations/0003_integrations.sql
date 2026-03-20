CREATE TYPE integration_provider AS ENUM ('github', 'jira', 'linear', 'clickup');

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider integration_provider NOT NULL,
  -- OAuth credentials (encrypted at rest in production)
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  -- Provider-specific external IDs
  external_workspace_id VARCHAR(255),  -- e.g., Jira site ID, Linear workspace ID, ClickUp team ID
  external_workspace_name VARCHAR(255),
  -- Configuration: which project/board maps to which team
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider)
);

-- Team-to-project mapping: links a Tandem team to a specific project/board in the ticket system
CREATE TABLE IF NOT EXISTS integration_project_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  external_project_id VARCHAR(255) NOT NULL,  -- e.g., Jira project key, Linear project ID
  external_project_name VARCHAR(255),
  config JSONB NOT NULL DEFAULT '{}',  -- sprint field name, priority mapping, etc.
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (integration_id, team_id)
);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_project_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_integrations ON integrations
  USING (organization_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_integration_mappings ON integration_project_mappings
  USING (integration_id IN (
    SELECT id FROM integrations WHERE organization_id = current_setting('app.current_tenant')::uuid
  ));
