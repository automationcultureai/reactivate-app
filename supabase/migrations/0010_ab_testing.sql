-- Migration 0010: A/B testing for email subject lines
--
-- Creates campaign_ab_tests to store campaign-level A/B subject line config per step.
-- Adds ab_variant_assigned to emails to record which variant each lead received.

CREATE TABLE campaign_ab_tests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sequence_number       integer NOT NULL CHECK (sequence_number BETWEEN 1 AND 4),
  ab_test_enabled       boolean NOT NULL DEFAULT false,
  subject_variant_a     text,
  subject_variant_b     text,
  ab_winner             varchar(15),        -- 'A', 'B', or 'inconclusive'
  ab_winner_selected_at timestamptz,
  ab_variant_a_opens    integer NOT NULL DEFAULT 0,
  ab_variant_b_opens    integer NOT NULL DEFAULT 0,
  ab_variant_a_sends    integer NOT NULL DEFAULT 0,
  ab_variant_b_sends    integer NOT NULL DEFAULT 0,
  first_send_at         timestamptz,        -- when first email in this step was sent (start of 4hr window)
  UNIQUE(campaign_id, sequence_number)
);

-- Per-lead variant assignment — 'A' or 'B', null if no A/B test active for this step
ALTER TABLE emails ADD COLUMN ab_variant_assigned char(1);
