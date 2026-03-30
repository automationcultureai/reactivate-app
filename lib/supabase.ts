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

export type AvailabilityHours = {
  timezone: string    // e.g. 'Australia/Sydney'
  days: number[]      // 0=Sun 1=Mon … 6=Sat
  start_hour: number  // 0–23
  end_hour: number    // 0–23, exclusive
}

export const DEFAULT_AVAILABILITY: AvailabilityHours = {
  timezone: 'Australia/Sydney',
  days: [1, 2, 3, 4, 5],
  start_hour: 9,
  end_hour: 17,
}

export type Client = {
  id: string
  name: string
  email: string
  clerk_org_id: string | null
  commission_per_job: number
  commission_type: 'flat' | 'percentage'
  commission_value: number
  google_calendar_id: string | null
  business_name: string | null     // Used in email footers; falls back to name if null
  business_address: string | null  // Postal address for legal email footer compliance
  notes: string | null
  client_industry: string | null   // Added by migration 007 — used in intelligence dashboard
  availability_hours: AvailabilityHours | null  // Added by migration 0013
  logo_url: string | null          // Added by migration 0015 — public URL to client logo
  brand_color: string | null       // Added by migration 0015 — hex color e.g. '#2563eb'
  branding_enabled: boolean        // Added by migration 0016 — when false, plain text emails (no logo/color)
  created_at: string
}

export type ListHealthScore = {
  id: string
  client_id: string
  campaign_id: string | null  // null = client aggregate score
  score: number
  tier: 'healthy' | 'moderate' | 'at_risk'
  bounce_count: number
  unsubscribe_count: number
  complaint_count: number
  open_rate: number | null
  click_rate: number | null
  recommendations: Array<{ trigger: string; message: string }> | null
  calculated_at: string
}

export type CampaignTemplate = {
  id: string
  name: string
  channel: 'email' | 'sms' | 'both'
  tone_preset: 'professional' | 'friendly' | 'casual' | 'empathetic' | 'direct' | 'authoritative' | 'playful' | 'sincere' | 'nostalgic' | 'consultative'
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
  deleted_at: string | null  // Added by migration 0014 — null = visible, set = archived
  channel: 'email' | 'sms' | 'both'
  tone_preset: 'professional' | 'friendly' | 'casual' | 'empathetic' | 'direct' | 'authoritative' | 'playful' | 'sincere' | 'nostalgic' | 'consultative'
  tone_custom: string | null
  custom_instructions: string | null
  consent_basis: 'Previous customer' | 'Quote/enquiry requested' | 'Service subscriber' | 'Other'
  notify_client: boolean
  send_booking_confirmation: boolean
  send_booking_reminder: boolean
  send_rate_per_hour: number
  activated_at: string | null  // Set when campaign moves to active; used for wave scheduling
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
  // RFM scoring fields (added by migration 0008)
  last_purchase_date: string | null
  purchase_count: number | null
  lifetime_value: number | null
  rfm_recency_score: number
  rfm_frequency_score: number
  rfm_monetary_score: number
  rfm_total_score: number
  rfm_wave: number
  created_at: string
}

export type Email = {
  id: string
  lead_id: string
  sequence_number: 1 | 2 | 3 | 4
  // null = Email 1 or Email 4 (no branching)
  // '2_unopened' | '2_opened' | '2_clicked' = Email 2 variants (added by migration 0009)
  // '3_unopened' | '3_opened' | '3_clicked' = Email 3 variants (added by migration 0009)
  branch_variant: string | null
  subject: string
  body: string
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  // 'A' or 'B' if an A/B subject line test was active for this step (added by migration 0010)
  ab_variant_assigned: string | null
}

export type CampaignAbTest = {
  id: string
  campaign_id: string
  sequence_number: 1 | 2 | 3 | 4
  ab_test_enabled: boolean
  subject_variant_a: string | null
  subject_variant_b: string | null
  ab_winner: 'A' | 'B' | 'inconclusive' | null
  ab_winner_selected_at: string | null
  ab_variant_a_opens: number
  ab_variant_b_opens: number
  ab_variant_a_sends: number
  ab_variant_b_sends: number
  first_send_at: string | null
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
  job_value: number | null
  commission_amount: number | null
  receipt_url: string | null
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
