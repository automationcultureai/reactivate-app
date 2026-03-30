# CLAUDE.md — Reactivate

## What This App Does
AI-powered email/SMS reactivation campaigns for small business clients. Agency uploads dormant leads → Claude generates sequences → emails sent → leads book via public page → agency earns commission per job.

**Live:** https://reactivate-psi.vercel.app

---

## Tech Stack
- Next.js (App Router, TypeScript, Tailwind)
- shadcn/ui v4 (@base-ui/react — NOT Radix)
- Clerk v7 (multi-tenant orgs)
- Supabase (Postgres + RLS)
- Resend (email sending via resend SDK)
- Claude API (server-side only)
- Google Calendar API (OAuth2)
- Vercel (hosting + 6 cron jobs)

---

## Critical Patterns — NEVER Break These
- **shadcn v4 Button has NO `asChild` prop** — use `<Link className={cn(buttonVariants(...))}>` instead
- **`buttonVariants`** is in `@/lib/button-variants` (NOT `@/components/ui/button`)
- **`getSupabaseClient()`** — NEVER module-level singleton, always call inside function
- **`getAdminUserId()`** from `@/lib/auth` — required at top of every admin API route
- **All cron routes** use `verifyCronSecret(req)` via `Authorization: Bearer [CRON_SECRET]`
- **`proxy.ts`** is the middleware file (NOT `middleware.ts`)
- **All admin pages** have `export const dynamic = 'force-dynamic'` via admin layout
- **Safety checks before every send:** campaign active, not opted out, not deleted, below MAX_SEND_RETRIES
- **`[BOOKING_LINK]`** is a placeholder replaced at send time in `lib/gmail.ts`

---

## Key Directories — Read ONLY What's Needed
- `app/admin/` — admin panel pages
- `app/dashboard/` — client dashboard
- `app/api/` — all API routes
- `app/book/`, `app/unsubscribe/`, `app/privacy/`, `app/terms/` — public pages
- `lib/` — supabase, auth, claude, gmail, twilio, calendar, csv, retry-send, alert
- `components/admin/`, `components/dashboard/`, `components/booking/`

## Forbidden — Do NOT Read
- `node_modules/`
- `.next/`
- `.git/`
- `tsconfig.tsbuildinfo`
- `package-lock.json`
- `.env.local`
- `plan.md`
- `architecture.md`
- `V2_feature_spec.md`
- `AI_rules.md`
- `PRD.md`

---

## Database
10 Supabase tables: `clients`, `campaign_templates`, `campaigns`, `leads`, `emails`, `sms_messages`, `bookings`, `send_failures`, `commission_disputes`, `lead_events`

RLS: DENY ALL to anon. All routes use service_role (bypasses RLS).

---

## Current To-Do
- [ ] Run migration `005_add_commission_paid_at.sql` in Supabase
- [ ] Update `AGENCY_NAME` + `AGENCY_ADDRESS` in Vercel env vars
- [ ] Set up Twilio when ready (code complete, needs credentials)
- [ ] Add real client Google Calendar IDs + share with bigcliff365@gmail.com

---

## Watch Points
- New server pages outside `/admin/` need `export const dynamic = 'force-dynamic'` manually
- Google Calendar `unauthorized_client` = wrong OAuth type (must be Web application)
- Google Calendar `insufficient_authentication_scopes` = token needs full `calendar` scope (not `calendar.events`)
