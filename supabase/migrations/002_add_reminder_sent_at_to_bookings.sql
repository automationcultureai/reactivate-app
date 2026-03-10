-- Migration 002: Add reminder_sent_at to bookings
-- Prevents duplicate reminder sends if the cron runs more than once.
-- Run this in the Supabase SQL Editor.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN bookings.reminder_sent_at IS
  'Set when the pre-appointment reminder email is sent. NULL = not yet sent.';
