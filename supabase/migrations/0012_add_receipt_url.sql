-- Migration 0012: Add receipt_url to bookings
-- Run this in the Supabase SQL Editor.
-- Also create a non-public Storage bucket named 'receipts' in the Supabase dashboard.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS receipt_url text;

COMMENT ON COLUMN bookings.receipt_url IS
  'Supabase Storage path to the uploaded receipt. Format: receipts/{bookingId}/{filename}';
