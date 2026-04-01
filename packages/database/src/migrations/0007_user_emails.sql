-- User email aliases for cross-system task matching
-- Primary email is auto-seeded; aliases are added via settings

CREATE TABLE IF NOT EXISTS user_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_user_emails_user_id ON user_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_user_emails_email ON user_emails(email);

-- Seed existing primary emails
INSERT INTO user_emails (user_id, email, is_primary)
SELECT id, email, TRUE FROM users
ON CONFLICT (email) DO NOTHING;
