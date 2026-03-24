-- Migration 0011: Commission V2
-- Adds commission_type/commission_value to clients and job_value/commission_amount to bookings.
-- Run this in the Supabase SQL Editor.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS commission_type text NOT NULL DEFAULT 'flat'
    CHECK (commission_type IN ('flat', 'percentage')),
  ADD COLUMN IF NOT EXISTS commission_value integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN clients.commission_type IS
  'flat = fixed dollar amount per job (cents); percentage = % of job value (basis points, e.g. 1000 = 10%)';

COMMENT ON COLUMN clients.commission_value IS
  'For flat: amount in cents. For percentage: basis points (1000 = 10%). See commission_type.';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS job_value integer,
  ADD COLUMN IF NOT EXISTS commission_amount integer;

COMMENT ON COLUMN bookings.job_value IS
  'Job value in cents as reported by the client at completion. NULL if not provided.';

COMMENT ON COLUMN bookings.commission_amount IS
  'Calculated commission in cents, set at completion. NULL until job is completed.';
