-- ============================================================
-- Migration 006 — List Health Scores (Feature 4)
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS list_health_scores (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id       uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  -- NULL campaign_id = client aggregate score
  score             integer NOT NULL,
  tier              varchar(10) NOT NULL CHECK (tier IN ('healthy', 'moderate', 'at_risk')),
  bounce_count      integer NOT NULL DEFAULT 0,
  unsubscribe_count integer NOT NULL DEFAULT 0,
  complaint_count   integer NOT NULL DEFAULT 0,
  open_rate         decimal(5,2),
  click_rate        decimal(5,2),
  recommendations   jsonb,
  calculated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_scores_client   ON list_health_scores(client_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_scores_campaign ON list_health_scores(campaign_id, calculated_at DESC);

ALTER TABLE list_health_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon_list_health_scores"
  ON list_health_scores FOR ALL TO anon USING (FALSE);
