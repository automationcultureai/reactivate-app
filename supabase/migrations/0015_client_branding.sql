-- Migration 0015: Add branding columns to clients
-- logo_url: public URL to the client's logo image (hosted externally or in Supabase Storage)
-- brand_color: hex color string (e.g. '#2563eb') used in email header and CTA button

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS brand_color TEXT;
