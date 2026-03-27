-- Soft-delete support for campaigns
-- Campaigns with a non-NULL deleted_at are archived and hidden from the default UI.
-- The cron jobs already skip campaigns with status != 'active', so setting
-- status = 'complete' on delete is enough to stop sends; deleted_at is the visibility flag.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS campaigns_deleted_at_idx ON campaigns (deleted_at);
