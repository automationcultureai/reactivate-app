-- Add branding_enabled flag to clients
-- When false, emails are sent as plain text (no logo, no brand color)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS branding_enabled BOOLEAN NOT NULL DEFAULT true;
