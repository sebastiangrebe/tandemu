-- 0001_initial.sql
-- Creates enums, tables, and RLS policies for tenant isolation.

-- Enums
CREATE TYPE plan_tier AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'canceled', 'trialing');
CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'member');

-- Organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  stripe_customer_id VARCHAR UNIQUE,
  stripe_subscription_id VARCHAR UNIQUE,
  plan_tier plan_tier NOT NULL DEFAULT 'free',
  subscription_status subscription_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  avatar_url VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Memberships table
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  role membership_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id)
);

-- Enable Row-Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- RLS Policy: organizations — only the current tenant org is visible
CREATE POLICY tenant_isolation_organizations ON organizations
  USING (id = current_setting('app.current_tenant')::uuid);

-- RLS Policy: memberships — only rows belonging to the current tenant org
CREATE POLICY tenant_isolation_memberships ON memberships
  USING (organization_id = current_setting('app.current_tenant')::uuid);

-- RLS Policy: users — visible if they share an org with the current tenant
CREATE POLICY tenant_isolation_users ON users
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.user_id = users.id
        AND memberships.organization_id = current_setting('app.current_tenant')::uuid
    )
  );
