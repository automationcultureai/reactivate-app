import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Security note on env var naming:
//
// NEXT_PUBLIC_SUPABASE_URL — intentionally public. This is the Supabase project
//   URL, not a secret. It is safe to expose in client bundles.
//
// NEXT_PUBLIC_SUPABASE_ANON_KEY — intentionally public. The anon key is a
//   publishable key governed by Supabase Row Level Security (RLS) policies.
//   It grants no elevated privileges on its own.
//
// SUPABASE_SERVICE_ROLE_KEY — server-only secret. This key bypasses RLS and
//   must NEVER have a NEXT_PUBLIC_ prefix or appear in client-side code.
// ---------------------------------------------------------------------------

/**
 * Returns a Supabase client using the service role key.
 * Use this in all server-side API routes.
 *
 * NEVER call this in client components — the service role key is server-only.
 * NEVER store the result at module level — call this function each time needed.
 */
export function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'
    )
  }

  return createClient(url, key, {
    auth: {
      // Disable auto-refresh and session persistence for server-side use
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Returns a Supabase client using the anon (public) key.
 * Use this only for public-facing routes where service role is not appropriate.
 *
 * RLS policies will apply when using this client.
 */
export function getSupabaseAnonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required'
    )
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// ============================================================
// Shared database types matching the Supabase schema
// ============================================================

export type Client = {
  id: string
  name: string
  email: string
  clerk_org_id: string | null
  commission_per_job: number
  google_calendar_id: string | null
  business_name: string | null     // Used in email footers; falls back to name if null
  business_address: string | null  // Postal address for legal email footer compliance
  notes: string | null
  created_at: string
}

export type CampaignTemplate = {
  id: string
  name: string
  channel: 'email' | 'sms' | 'both'
  tone_preset: 'professional' | 'friendly' | 'casual' | 'urgent' | 'empathetic'
  tone_custom: string | null
  custom_instructions: string | null
  created_at: string
}

export type Campaign = {
  id: string
  client_id: string
  template_id: string | null
  name: string
  status: 'draft' | 'ready' | 'active' | 'paused' | 'complete'
  channel: 'email' | 'sms' | 'both'
  tone_preset: 'professional' | 'friendly' | 'casual' | 'urgent' | 'empathetic'
  tone_custom: string | null
  custom_instructions: string | null
  consent_basis: 'Previous customer' | 'Quote/enquiry requested' | 'Service subscriber' | 'Other'
  notify_client: boolean
  send_booking_confirmation: boolean
  send_booking_reminder: boolean
  send_rate_per_hour: number
  created_at: string
}

export type Lead = {
  id: string
  campaign_id: string
  client_id: string
  name: string
  email: string | null
  phone: string | null
  booking_token: string
  status:
    | 'pending'
    | 'emailed'
    | 'sms_sent'
    | 'clicked'
    | 'booked'
    | 'completed'
    | 'unsubscribed'
    | 'send_failed'
    | 'cancelled'
    | 'deleted'
  sms_opt_out: boolean
  email_opt_out: boolean
  send_failure_count: number
  last_contact_date: string | null
  service_type: string | null
  purchase_value: string | null
  notes: string | null
  created_at: string
}

export type Email = {
  id: string
  lead_id: string
  sequence_number: 1 | 2 | 3 | 4
  subject: string
  body: string
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
}

export type SmsMessage = {
  id: string
  lead_id: string
  sequence_number: 1 | 2 | 3 | 4
  body: string
  sent_at: string | null
  clicked_at: string | null
}

export type Booking = {
  id: string
  lead_id: string
  client_id: string
  scheduled_at: string
  google_event_id: string | null
  status: 'booked' | 'completed' | 'cancelled' | 'disputed'
  completed_at: string | null
  completed_by: 'client' | 'admin' | 'auto' | null
  commission_owed: number
  reminder_sent_at: string | null
  commission_paid_at: string | null   // Set when agency marks as paid; NULL = outstanding
  created_at: string
}

export type SendFailure = {
  id: string
  lead_id: string
  campaign_id: string
  channel: 'email' | 'sms'
  sequence_number: 1 | 2 | 3 | 4
  error_message: string
  attempt_count: number
  resolved: boolean
  created_at: string
}

export type CommissionDispute = {
  id: string
  booking_id: string
  client_id: string
  reason: string
  status: 'open' | 'resolved' | 'rejected'
  admin_notes: string | null
  created_at: string
}

export type LeadEvent = {
  id: string
  lead_id: string
  event_type:
    | 'email_sent'
    | 'email_opened'
    | 'sms_sent'
    | 'clicked'
    | 'booked'
    | 'completed'
    | 'unsubscribed'
    | 'data_erased'
    | 'booking_cancelled'
    | 'sms_opted_out'
    | 'auto_completed'
  description: string
  created_at: string
}
