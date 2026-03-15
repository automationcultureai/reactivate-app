-- Migration: 0008_rfm_scoring.sql
-- Adds RFM lead scoring and wave assignment fields.
-- DEFAULT rfm_wave = 1 preserves backward-compat send behaviour for existing leads.
-- New leads go through the scorer (lib/rfm.ts) which assigns the correct wave.

-- RFM input columns (optional CSV data, null when not provided)
ALTER TABLE leads ADD COLUMN last_purchase_date date;
ALTER TABLE leads ADD COLUMN purchase_count integer;
ALTER TABLE leads ADD COLUMN lifetime_value decimal(10,2);

-- RFM computed scores (default 1 = lowest tier; scorer overrides these)
ALTER TABLE leads ADD COLUMN rfm_recency_score integer NOT NULL DEFAULT 1;
ALTER TABLE leads ADD COLUMN rfm_frequency_score integer NOT NULL DEFAULT 1;
ALTER TABLE leads ADD COLUMN rfm_monetary_score integer NOT NULL DEFAULT 1;
ALTER TABLE leads ADD COLUMN rfm_total_score integer NOT NULL DEFAULT 3;

-- Wave assignment: 1 = high priority, 2 = medium, 3 = low
-- DEFAULT 1 ensures existing leads (pre-migration) continue to send immediately
ALTER TABLE leads ADD COLUMN rfm_wave integer NOT NULL DEFAULT 1;

-- Campaign activation timestamp — needed for wave-delayed scheduling in follow-up cron
ALTER TABLE campaigns ADD COLUMN activated_at timestamptz;
