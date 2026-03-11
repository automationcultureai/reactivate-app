-- ============================================================
-- Migration 007 — Intelligence Dashboard (Feature 5)
-- Run in Supabase SQL Editor
-- ============================================================

-- Add industry field to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_industry varchar(50);

-- Performance indexes for intelligence dashboard queries
CREATE INDEX IF NOT EXISTS idx_lead_events_type_date
  ON lead_events(event_type, created_at);

CREATE INDEX IF NOT EXISTS idx_bookings_client_status_date
  ON bookings(client_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_campaigns_tone_date
  ON campaigns(tone_preset, created_at);

CREATE INDEX IF NOT EXISTS idx_campaigns_channel_date
  ON campaigns(channel, created_at);
