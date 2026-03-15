# CLAUDE.md — Reactivate Project Context

> Read this at the start of every session. It is the source of truth for the project state.

---

## What This App Does

**Reactivate** is a multi-client SaaS platform for an AI automation agency based in Melbourne, Australia. It runs AI-powered email (and SMS) reactivation campaigns on behalf of small business clients. The agency uploads dormant lead CSVs, Claude generates personalised email/SMS sequences, messages are sent automatically, leads can book jobs via a public booking page connected to the client's Google Calendar, and the agency earns a flat commission per completed job.

**URL:** https://reactivate-psi.vercel.app
**Repo:** https://github.com/loudfarter77/reactivate-app
**Local path:** /Users/nico/Desktop/reactivate-app

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Tailwind CSS) |
| UI | shadcn/ui v4 (uses @base-ui/react — NOT Radix) |
| Auth | Clerk v7 (multi-tenant orgs) |
| Database | Supabase (Postgres + RLS) |
| Email | Gmail SMTP via nodemailer |
| SMS | Twilio (coded, not configured) |
| AI | Claude API (@anthropic-ai/sdk, server-side only) |
| Calendar | Google Calendar API (OAuth2) |
| Hosting | Vercel |
| Theme | next-themes (dark default) |

---

## Critical Patterns — Never Break These

- **shadcn v4 Button has NO `asChild` prop.** Use `<Link className={cn(buttonVariants(...))}>` instead
- **`buttonVariants` is in `@/lib/button-variants`** (not `@/components/ui/button`) to avoid client-boundary issues
- **`getSupabaseClient()`** from `@/lib/supabase` — NEVER module-level singleton, always call inside function
- **`getAdminUserId()`** from `@/lib/auth` — required at top of every admin API route
- **All cron routes** use `verifyCronSecret(req)` — verified via `Authorization: Bearer [CRON_SECRET]` header
- **`proxy.ts`** is the Next.js 16 middleware file (NOT `middleware.ts`)
- **All admin pages** have `export const dynamic = 'force-dynamic'` via the admin layout
- **Safety checks before every email/SMS send:** campaign active, not opted out, not deleted, below MAX_SEND_RETRIES
- **`[BOOKING_LINK]`** is a placeholder in Claude-generated content, replaced at send time

---

## All 27 Phases — Completion Status

All 27 phases from `plan.md` are **COMPLETE**. The app is live and end-to-end tested.

Additional post-launch features built on top:
- Lead enrichment CSV columns (last_contact_date, service_type, purchase_value, notes)
- 7 lead management features (edit client, edit lead, opt-out toggle, view sent emails, send next email manually, add leads to existing campaign, bulk delete)
- Commission payment tracking (outstanding vs paid, mark as paid per client)
- Client dashboard improvements (6 stat blocks with tooltips, spend block, last action column, dispute resolution status)
- Dark/light mode toggle on both admin sidebar and client nav
- Force-dynamic on all data pages (was caching as static)

---

## Current State — What's Built and Working

### ✅ Admin Panel (`/admin/*`)
- **Dashboard** — 5 stat cards (Clients, Leads, Bookings, Outstanding commission, Total paid)
- **Clients** (`/admin/clients`) — list, create, edit (full edit dialog), notes
- **Campaign creation** — CSV upload (with optional enrichment columns), tone/channel/consent settings, template selector
- **Campaign detail** — generate sequences, preview & edit emails, approve & send, pause/resume, add leads, generate for new leads only, bookings with override complete, leads with edit/opt-out/send-next/erase/bulk-delete/audit log
- **Campaign preview** — expandable per lead, inline email editing, Approve & Send button
- **Templates** — create, edit, delete
- **Disputes** — list open disputes, uphold/reject with admin notes
- **Billing** — 3 summary cards (Outstanding/Paid/Total), per-client unpaid table, "Mark as paid" button, paid summary row, send log CSV download, commission CSV export
- **Settings** — admin user list (Clerk), add admin instructions

### ✅ Client Dashboard (`/dashboard`)
- Stats: Total leads, Leads booked, Email open rate, Click through rate, Booking rate, Completion rate, Total spend (7 cards with ℹ️ tooltips)
- Leads table: Name, Status (client-friendly labels), Last action (Email N sent / event), Added date
- Bookings: Mark complete, Raise dispute, Resolved/Upheld/Rejected status with admin notes
- Dark/light mode toggle, Sign out button

### ✅ Public Pages
- `/book/[token]` — booking page with Google Calendar slot picker, 3-step wizard
- `/unsubscribe/[token]` — email unsubscribe confirmation
- `/privacy` — Australian-context privacy policy (Privacy Act 1988, OAIC)
- `/terms` — Australian-context ToS (ACL, Victorian jurisdiction)

### ✅ Infrastructure
- 6 Vercel cron jobs (follow-up, reminders, calendar-sync, retry-sends, auto-complete, data-retention)
- Rate limiting on /book and /unsubscribe routes (proxy.ts)
- Cron error alerting via email (lib/alert.ts)
- GDPR erasure (anonymise, retain billing)
- Monthly data retention cron

---

## Environment Variables (`.env.local`)

All set and working:
- `CLERK_*` — Clerk auth
- `SUPABASE_*` — Supabase (service role key correct)
- `ANTHROPIC_API_KEY` — Claude API ✅
- `GMAIL_USER=bigcliff365@gmail.com` ✅
- `GMAIL_APP_PASSWORD` ✅
- `GOOGLE_CLIENT_ID` — Web application type (NOT Desktop app — Desktop app gives `unauthorized_client` server-side)
- `GOOGLE_CLIENT_SECRET` ✅
- `GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/callback`
- `GOOGLE_REFRESH_TOKEN` — Must be generated with `calendar` scope (not `calendar.events` — insufficient for freebusy)
- `NEXT_PUBLIC_APP_URL=https://reactivate-psi.vercel.app` (no trailing slash)
- `CRON_SECRET=cron_xvBWKP660LJ5qW`
- `AGENCY_NAME=TBD` ← **Needs updating to real name**
- `AGENCY_ADDRESS=TBD` ← **Needs updating to real Melbourne address**
- Twilio: all blank (SMS coded but not configured)

---

## Supabase

**Project URL:** `https://lcyvhviebewtbbfpygln.supabase.co`

### Tables (10 core + indexes)
`clients`, `campaign_templates`, `campaigns`, `leads`, `emails`, `sms_messages`, `bookings`, `send_failures`, `commission_disputes`, `lead_events`

### Migrations run (must run in order if rebuilding)
1. `supabase/migrations/001_add_client_business_details.sql` — business_name, business_address on clients
2. `supabase/migrations/002_add_reminder_sent_at_to_bookings.sql` — reminder deduplication
3. `supabase/migrations/003_add_lead_enrichment_columns.sql` — last_contact_date, service_type, purchase_value, notes on leads
4. `supabase/migrations/004_tighten_anon_rls.sql` — adds WITH CHECK (FALSE) to deny anon INSERT
5. `supabase/migrations/005_add_commission_paid_at.sql` — payment tracking on bookings

**RLS:** All tables have `DENY ALL TO anon`. Service role bypasses RLS. All data access is server-side.

---

## Google Calendar — Important Notes

- **Must use Web application OAuth client** (not Desktop app — Desktop app returns `unauthorized_client` when used server-side)
- **Scope required:** `https://www.googleapis.com/auth/calendar` (full scope — `calendar.events` alone is insufficient for freebusy queries)
- **Get refresh token:** run `node get-refresh-token.js` in Chrome (Firefox fails)
- After running script, token appears in browser at `localhost:3000`
- `get-refresh-token.js` is in `.gitignore` (one-time utility, never committed)
- Client calendars must be **shared with `bigcliff365@gmail.com`** (Make changes to events permission)
- Calendar ID `primary` works for testing (agency's own calendar)

---

## Key File Structure

```
app/
  admin/
    layout.tsx              ← dynamic = 'force-dynamic', sidebar wrapper
    page.tsx                ← admin home dashboard
    clients/page.tsx        ← client list
    clients/new/page.tsx    ← create client
    clients/[clientId]/page.tsx  ← client detail + notes
    clients/[clientId]/campaigns/new/page.tsx  ← create campaign
    clients/[clientId]/campaigns/[campaignId]/page.tsx  ← campaign detail (main page)
    clients/[clientId]/campaigns/[campaignId]/preview/page.tsx
    templates/page.tsx
    billing/page.tsx
    disputes/page.tsx
    settings/page.tsx
  dashboard/
    layout.tsx
    page.tsx                ← client dashboard (scoped by Clerk orgId)
  book/[token]/page.tsx     ← public booking page
  unsubscribe/[token]/page.tsx
  privacy/page.tsx          ← Australian privacy policy
  terms/page.tsx            ← Australian ToS
  api/
    campaigns/[campaignId]/generate/route.ts  ← Claude generation (skips already-generated leads)
    campaigns/[campaignId]/send/route.ts      ← Initial send (Email 1 + SMS 1)
    campaigns/[campaignId]/pause/route.ts
    campaigns/[campaignId]/resume/route.ts
    campaigns/[campaignId]/emails/[emailId]/edit/route.ts
    campaigns/[campaignId]/leads/route.ts     ← POST add leads, DELETE bulk
    campaigns/create/route.ts
    campaigns/templates/route.ts
    leads/[id]/book/route.ts   ← public booking submission
    leads/[id]/delete/route.ts ← GDPR erase
    leads/[id]/opt-out/route.ts
    leads/[id]/send-next/route.ts
    leads/[id]/route.ts        ← PATCH edit lead
    bookings/[bookingId]/dispute/route.ts
    disputes/[disputeId]/resolve/route.ts
    billing/export/route.ts
    billing/mark-paid/route.ts
    billing/send-log/[campaignId]/route.ts
    jobs/complete/route.ts
    jobs/auto-complete/route.ts
    cron/follow-up/route.ts
    cron/reminders/route.ts
    cron/calendar-sync/route.ts
    cron/retry-sends/route.ts
    cron/data-retention/route.ts
    sends/retry/route.ts
    track/open/[emailId]/route.ts  ← tracking pixel
    unsubscribe/[token]/route.ts
    webhooks/twilio/route.ts

lib/
  supabase.ts       ← getSupabaseClient(), getSupabaseAnonClient(), all DB types
  auth.ts           ← getAdminUserId()
  claude.ts         ← generateEmailSequence(), generateSmsSequence() (server-only)
  gmail.ts          ← sendEmail(), sendDelay(), sendBookingConfirmation(), etc.
  twilio.ts         ← sendSms(), verifyWebhookSignature(), isTwilioConfigured()
  calendar.ts       ← getAvailableSlots(), createBooking(), checkBookingStatus(), isCalendarConfigured()
  csv.ts            ← parseLeadsCsv() — with optional enrichment columns
  retry-send.ts     ← retryEmailSend() — shared by manual + cron retry
  alert.ts          ← sendAdminAlert() — email admin on cron failure
  button-variants.ts ← buttonVariants (extracted from button.tsx for server component use)
  clerk.ts          ← createClientOrganization(), inviteUserToOrganization()

components/
  admin/
    AdminSidebar.tsx          ← sidebar nav + sign out + theme toggle
    CampaignLeadList.tsx      ← full lead table with all 7 management features
    CampaignAnalytics.tsx     ← 4 stat cards
    CampaignBookings.tsx      ← bookings with admin override
    CreateCampaignForm.tsx    ← campaign creation form
    CreateClientForm.tsx
    ClientEditDialog.tsx
    LeadEditDialog.tsx
    AddLeadsDialog.tsx + AddLeadsButton.tsx
    MarkPaidButton.tsx
    FailedSendsList.tsx
    DisputesList.tsx
    GenerateButton.tsx        ← supports label prop for "Generate for N new leads"
    PauseResumeButton.tsx
    ... (more admin components)
  dashboard/
    DashboardNav.tsx          ← top nav + theme toggle + sign out
    DashboardStats.tsx        ← 7 stat cards with tooltips (incl. totalSpend)
    DashboardBookings.tsx     ← with dispute status states
    DashboardLeads.tsx        ← with last action column (Email N sent)
  booking/
    BookingForm.tsx           ← 3-step date/time/confirm wizard
  ui/
    ThemeToggle.tsx           ← dark/light toggle using next-themes

proxy.ts            ← Next.js 16 middleware (rate limiting + Clerk auth)
vercel.json         ← 6 cron schedules
supabase/schema.sql ← canonical schema
supabase/migrations/  ← 005 migrations
get-refresh-token.js  ← one-time Google OAuth helper (gitignored)
```

---

## Pending / To-Do

- [ ] **Run migration 005** in Supabase SQL Editor (`supabase/migrations/005_add_commission_paid_at.sql`)
- [ ] **Update `AGENCY_NAME`** and `AGENCY_ADDRESS` in `.env.local` and Vercel env vars to real values
- [ ] **Set up Twilio** when ready for SMS campaigns (all code is complete, just needs credentials)
- [ ] **Have legal pages reviewed** by an Australian lawyer before using with real clients
- [ ] **Add clients' Google Calendar IDs** and share each calendar with `bigcliff365@gmail.com`

---

## Known Issues / Watch Points

- **Supabase data won't update without force-dynamic** — all admin pages now have it via layout, dashboard page has it explicitly. If a new server page is added under `/admin`, it inherits from layout. Other paths need it manually.
- **Never mutate Supabase directly** (via Supabase dashboard table editor) — always go through the app UI/API or the changes won't be reflected until the next request (force-dynamic handles read freshness but the app's state relies on consistent data)
- **Google Calendar `unauthorized_client`** = wrong OAuth client type (must be Web application, not Desktop app)
- **Google Calendar `insufficient_authentication_scopes`** = token generated with `calendar.events` scope instead of `calendar`
- **Email `[BOOKING_LINK]` placeholder** — replaced at send time by `lib/gmail.ts`. If it appears in sent emails, the replacement is working. The tracking pixel URL is also generated at send time.
- **30–60 second send delay** means initial send of large campaigns will approach Vercel's 300s function limit. This is a known V1 constraint.
- **RLS note**: service_role bypasses RLS. All server-side routes use service_role. The deny-anon policies exist as defence-in-depth.

---

## Where to Pick Up

The app is **feature-complete and live**. Focus areas for next session:

1. **Run migration 005** (`commission_paid_at`) in Supabase
2. **Fill in `AGENCY_NAME` and `AGENCY_ADDRESS`** in Vercel env vars + redeploy
3. **Test the "Mark as paid" flow** on billing page
4. **Onboard first real client** — create client → set calendar ID → share calendar → invite to Clerk org
5. **Any bugs or UX fixes** that come up from real usage

---

## Cron Test Commands (production)

```bash
curl -X POST https://reactivate-psi.vercel.app/api/cron/follow-up \
  -H "Authorization: Bearer cron_xvBWKP660LJ5qW"

curl -X POST https://reactivate-psi.vercel.app/api/cron/reminders \
  -H "Authorization: Bearer cron_xvBWKP660LJ5qW"

curl -X POST https://reactivate-psi.vercel.app/api/cron/calendar-sync \
  -H "Authorization: Bearer cron_xvBWKP660LJ5qW"
```

Expected response when nothing is due: `{"message":"No...","sent":0}`
