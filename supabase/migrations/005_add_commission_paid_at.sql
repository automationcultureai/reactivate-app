-- Migration 005: Track commission payment status
-- Run this in the Supabase SQL Editor.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS commission_paid_at TIMESTAMPTZ;

COMMENT ON COLUMN bookings.commission_paid_at IS
  'Set when the agency marks this booking commission as paid/invoiced. NULL = outstanding.';

-- Index for fast "unpaid" queries on the billing page
CREATE INDEX IF NOT EXISTS idx_bookings_commission_paid_at ON bookings(commission_paid_at);
