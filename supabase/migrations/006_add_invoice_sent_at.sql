-- Migration 006: Add invoice_sent_at to track invoice lifecycle
-- Run this in the Supabase SQL Editor.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS invoice_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN bookings.invoice_sent_at IS
  'Set when the agency sends an invoice to the client. NULL = not yet invoiced. See also commission_paid_at.';

CREATE INDEX IF NOT EXISTS idx_bookings_invoice_sent_at ON bookings(invoice_sent_at);
