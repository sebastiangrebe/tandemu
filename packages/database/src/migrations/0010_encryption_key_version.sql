-- Add encryption key version tracking for integration tokens
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS encryption_key_version INTEGER NOT NULL DEFAULT 0;
-- 0 = plain text (unencrypted, legacy/OSS)
-- 1+ = encrypted with the corresponding key version
