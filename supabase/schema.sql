-- ============================================================
-- REACTIVATE — Full Database Schema
-- Run this entire file in the Supabase SQL Editor
-- Tables created in FK dependency order
-- ============================================================

-- Enable pgcrypto for gen_random_uuid() if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. clients
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  email               TEXT NOT NULL,
  clerk_org_id        TEXT UNIQUE,
  commission_per_job  INTEGER NOT NULL DEFAULT 0,  -- flat fee in cents
  google_calendar_id  TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_clerk_org_id ON clients(clerk_org_id);

-- ============================================================
-- 2. campaign_templates
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  channel             TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'both')),
  tone_preset         TEXT NOT NULL CHECK (tone_preset IN ('professional', 'friendly', 'casual', 'urgent', 'empathetic')),
  tone_custom         TEXT,
  custom_instructions TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. campaigns
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                 UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  template_id               UUID REFERENCES campaign_templates(id) ON DELETE SET NULL,
  name                      TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'ready', 'active', 'paused', 'complete')),
  channel                   TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'both')),
  tone_preset               TEXT NOT NULL CHECK (tone_preset IN ('professional', 'friendly', 'casual', 'urgent', 'empathetic')),
  tone_custom               TEXT,
  custom_instructions       TEXT,
  consent_basis             TEXT NOT NULL CHECK (consent_basis IN ('Previous customer', 'Quote/enquiry requested', 'Service subscriber', 'Other')),
  notify_client             BOOLEAN NOT NULL DEFAULT TRUE,
  send_booking_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
  send_booking_reminder     BOOLEAN NOT NULL DEFAULT TRUE,
  send_rate_per_hour        INTEGER NOT NULL DEFAULT 30,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_client_id ON campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status    ON campaigns(status);

-- ============================================================
-- 4. leads
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  email               TEXT,
  phone               TEXT,
  booking_token       UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'emailed', 'sms_sent', 'clicked', 'booked',
                                          'completed', 'unsubscribed', 'send_failed', 'cancelled', 'deleted')),
  sms_opt_out         BOOLEAN NOT NULL DEFAULT FALSE,
  email_opt_out       BOOLEAN NOT NULL DEFAULT FALSE,
  send_failure_count  INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_campaign_id    ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_client_id      ON leads(client_id);
CREATE INDEX IF NOT EXISTS idx_leads_booking_token  ON leads(booking_token);
CREATE INDEX IF NOT EXISTS idx_leads_status         ON leads(status);

-- ============================================================
-- 5. emails
-- ============================================================
CREATE TABLE IF NOT EXISTS emails (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sequence_number  INTEGER NOT NULL CHECK (sequence_number BETWEEN 1 AND 4),
  subject          TEXT NOT NULL,
  body             TEXT NOT NULL,
  sent_at          TIMESTAMPTZ,
  opened_at        TIMESTAMPTZ,
  clicked_at       TIMESTAMPTZ,
  UNIQUE(lead_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_emails_lead_id ON emails(lead_id);
CREATE INDEX IF NOT EXISTS idx_emails_sent_at ON emails(sent_at);

-- ============================================================
-- 6. sms_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sequence_number  INTEGER NOT NULL CHECK (sequence_number BETWEEN 1 AND 4),
  body             TEXT NOT NULL,
  sent_at          TIMESTAMPTZ,
  clicked_at       TIMESTAMPTZ,
  UNIQUE(lead_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_lead_id ON sms_messages(lead_id);

-- ============================================================
-- 7. bookings
-- ============================================================
CREATE TABLE IF NOT EXISTS bookings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  scheduled_at     TIMESTAMPTZ NOT NULL,
  google_event_id  TEXT,
  status           TEXT NOT NULL DEFAULT 'booked'
                     CHECK (status IN ('booked', 'completed', 'cancelled', 'disputed')),
  completed_at     TIMESTAMPTZ,
  completed_by     TEXT CHECK (completed_by IN ('client', 'admin', 'auto')),
  commission_owed  INTEGER NOT NULL DEFAULT 0,  -- in cents
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_lead_id          ON bookings(lead_id);
CREATE INDEX IF NOT EXISTS idx_bookings_client_id        ON bookings(client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status           ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_google_event_id  ON bookings(google_event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_at     ON bookings(scheduled_at);

-- ============================================================
-- 8. send_failures
-- ============================================================
CREATE TABLE IF NOT EXISTS send_failures (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id      UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  channel          TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  sequence_number  INTEGER NOT NULL CHECK (sequence_number BETWEEN 1 AND 4),
  error_message    TEXT NOT NULL,
  attempt_count    INTEGER NOT NULL DEFAULT 1,
  resolved         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_send_failures_lead_id     ON send_failures(lead_id);
CREATE INDEX IF NOT EXISTS idx_send_failures_campaign_id ON send_failures(campaign_id);
CREATE INDEX IF NOT EXISTS idx_send_failures_resolved    ON send_failures(resolved);

-- ============================================================
-- 9. commission_disputes
-- ============================================================
CREATE TABLE IF NOT EXISTS commission_disputes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  client_id    UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'resolved', 'rejected')),
  admin_notes  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_disputes_booking_id ON commission_disputes(booking_id);
CREATE INDEX IF NOT EXISTS idx_commission_disputes_client_id  ON commission_disputes(client_id);
CREATE INDEX IF NOT EXISTS idx_commission_disputes_status     ON commission_disputes(status);

-- ============================================================
-- 10. lead_events
-- ============================================================
CREATE TABLE IF NOT EXISTS lead_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL
                CHECK (event_type IN ('email_sent', 'email_opened', 'sms_sent', 'clicked',
                                      'booked', 'completed', 'unsubscribed', 'data_erased',
                                      'booking_cancelled', 'sms_opted_out', 'auto_completed')),
  description TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_events_lead_id    ON lead_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_events_event_type ON lead_events(event_type);
CREATE INDEX IF NOT EXISTS idx_lead_events_created_at ON lead_events(created_at);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY on all 10 tables
-- ============================================================
ALTER TABLE clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns            ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads                ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails               ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE send_failures        ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_disputes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_events          ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
--
-- Strategy for V1:
--   All data access goes through server-side API routes.
--   Admin routes use the service_role key (bypasses RLS by default in Supabase).
--   Client dashboard routes use service_role but enforce access control in code.
--   The anon role is denied access to all tables (enforced by having no
--   permissive anon policies — Supabase denies by default when RLS is on).
--
--   Full JWT-based multi-tenant RLS (Clerk → Supabase JWT) is Phase 27.
--
-- These policies explicitly deny anon access and allow authenticated
-- service operations. service_role always bypasses RLS in Supabase.
-- ============================================================

-- clients: deny anon, service_role bypasses automatically
CREATE POLICY "deny_anon_clients"
  ON clients FOR ALL TO anon USING (FALSE);

-- campaign_templates: deny anon
CREATE POLICY "deny_anon_campaign_templates"
  ON campaign_templates FOR ALL TO anon USING (FALSE);

-- campaigns: deny anon
CREATE POLICY "deny_anon_campaigns"
  ON campaigns FOR ALL TO anon USING (FALSE);

-- leads: deny anon
CREATE POLICY "deny_anon_leads"
  ON leads FOR ALL TO anon USING (FALSE);

-- emails: deny anon
CREATE POLICY "deny_anon_emails"
  ON emails FOR ALL TO anon USING (FALSE);

-- sms_messages: deny anon
CREATE POLICY "deny_anon_sms_messages"
  ON sms_messages FOR ALL TO anon USING (FALSE);

-- bookings: deny anon
CREATE POLICY "deny_anon_bookings"
  ON bookings FOR ALL TO anon USING (FALSE);

-- send_failures: deny anon
CREATE POLICY "deny_anon_send_failures"
  ON send_failures FOR ALL TO anon USING (FALSE);

-- commission_disputes: deny anon
CREATE POLICY "deny_anon_commission_disputes"
  ON commission_disputes FOR ALL TO anon USING (FALSE);

-- lead_events: deny anon
CREATE POLICY "deny_anon_lead_events"
  ON lead_events FOR ALL TO anon USING (FALSE);
