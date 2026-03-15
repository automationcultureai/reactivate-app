# REACTIVATE — Feature Enhancement Specification
> Version 1.0 — March 2026
> Add these 5 features to the existing codebase. Do not rebuild or refactor existing features.

---

## Features in this document

1. RFM Lead Scoring & Priority Waves
2. Branching Sequence Logic
3. A/B Testing for Subject Lines
4. List Health Score & Deliverability Dashboard
5. Cross-Campaign Intelligence Dashboard

---

## How to use this document

Read the full spec before writing any code. Each feature has four sections:
- **What it is** — the plain-English description
- **Behaviour spec** — exact logic, rules, and edge cases
- **Database changes** — new fields and tables as SQL
- **UI touchpoints** — every screen that needs to change

Implement one feature completely before starting the next. Each feature is self-contained and shippable independently.

---

---

# FEATURE 1 — RFM Lead Scoring & Priority Waves

## What it is

The existing system treats every lead in a CSV identically. RFM scoring evaluates each lead on three dimensions — Recency (when they last bought), Frequency (how often they bought), and Monetary value (how much they spent) — and assigns them to a send wave. High-value leads are contacted first.

**Why this matters:** for a client with 500 dormant leads, contacting the best 100 first vs. randomly is a significant difference in early conversion rate. Wave 1 leads have the highest likelihood of reactivation.

---

## Behaviour spec

### CSV enrichment

Extend the existing CSV column mapper to optionally accept three new columns:

| Column name | Type | Description |
|---|---|---|
| `last_purchase_date` | date | When the lead last made a purchase |
| `purchase_count` | integer | Total number of purchases |
| `lifetime_value` | decimal | Total spend with the client |

All three fields are optional. Leads missing these fields receive default scores (see below).

### Scoring logic

Score each dimension 1–3. Combined RFM score = sum of all three (min 3, max 9).

**Recency score** (based on `last_purchase_date`):
- < 6 months ago = 3
- 6–12 months ago = 2
- > 12 months ago, or field missing = 1

**Frequency score** (based on `purchase_count`):
- >= 5 purchases = 3
- 2–4 purchases = 2
- <= 1 purchase, or field missing = 1

**Monetary score** (based on `lifetime_value`):
- Top 33% of leads in this campaign = 3
- Middle 33% = 2
- Bottom 33%, or field missing = 1

Note: monetary percentiles are calculated per campaign, not globally.

### Wave assignment

| Wave | Score range | Send timing |
|---|---|---|
| Wave 1 (High Priority) | 7–9 | Email 1 / SMS 1 on campaign activation (Days 1–2) |
| Wave 2 (Medium Priority) | 4–6 | Email 1 / SMS 1 on Day 3–4 after activation |
| Wave 3 (Low Priority) | 3 | Email 1 / SMS 1 on Day 5–6 after activation |

Subsequent follow-up emails for each lead are scheduled relative to their wave start date, not the campaign activation date.

### Edge cases
- If all leads in a campaign have identical `lifetime_value` (or none have it), assign all monetary scores = 2 (neutral). Do not split 1/2/3 when there is no meaningful variation.
- If a campaign has fewer than 9 leads, do not apply monetary percentile splitting — assign all monetary scores = 2.

---

## Database changes

```sql
-- Migration: 0005_rfm_scoring.sql
ALTER TABLE leads ADD COLUMN last_purchase_date date;
ALTER TABLE leads ADD COLUMN purchase_count integer;
ALTER TABLE leads ADD COLUMN lifetime_value decimal(10,2);
ALTER TABLE leads ADD COLUMN rfm_recency_score integer NOT NULL DEFAULT 1;
ALTER TABLE leads ADD COLUMN rfm_frequency_score integer NOT NULL DEFAULT 1;
ALTER TABLE leads ADD COLUMN rfm_monetary_score integer NOT NULL DEFAULT 1;
ALTER TABLE leads ADD COLUMN rfm_total_score integer NOT NULL DEFAULT 3;
ALTER TABLE leads ADD COLUMN rfm_wave integer NOT NULL DEFAULT 1;
```

---

## UI touchpoints

**CSV column mapper (existing screen)**
- Add optional mapping slots for `last_purchase_date`, `purchase_count`, `lifetime_value`
- Add a tooltip on hover: "Optional — used to score and prioritise leads by value. If not provided, all leads are assigned a default mid-tier score."
- Show a note if none of the three fields are mapped: "RFM scoring will use defaults. All leads will be Wave 2."

**Campaign creation — preview screen (before Approve & Send)**
- Add a wave summary block: "Wave 1: 45 leads (sends Days 1–2) · Wave 2: 120 leads (sends Days 3–4) · Wave 3: 30 leads (sends Days 5–6)"
- If no RFM data was provided: "All 195 leads in Wave 2 (no RFM data provided)"

**Campaign detail page — lead list**
- Add RFM score badge to each lead row: e.g. "8/9" with colour coding
  - Score 7–9: green badge
  - Score 4–6: amber badge
  - Score 3: grey badge
- Group leads by wave with collapsible wave headers showing lead count

---

---

# FEATURE 2 — Branching Sequence Logic

## What it is

The existing sequence is linear: Email 1 → Email 2 on Day 3 → Email 3 on Day 8 → Email 4 on cancellation/re-engagement. Branching makes the follow-up each lead receives dependent on their actual behaviour with the previous email.

**Why this matters:** someone who opened an email twice but didn't click is showing strong intent — they need a different nudge than someone who never opened it. Sending the same follow-up to both ignores a clear buying signal.

---

## Behaviour spec

### Lead behaviour states

Evaluated per lead after each email send. Evaluation runs via the existing daily cron.

| State | Definition |
|---|---|
| `unopened` | Email sent. `opened_at` is null after the evaluation window (48 hours post-send). |
| `opened_no_click` | `opened_at` is set but booking link was not clicked. |
| `clicked_no_book` | Booking link click recorded but no booking created. |
| `bounced` | Hard bounce recorded on this email. |

### Branch routing

**Email 2 / SMS 2 (Day 3 trigger):**

| Lead state | Variant to send |
|---|---|
| `unopened` | "We know you're busy" — softer, lower pressure, different subject line |
| `opened_no_click` | "Still thinking it over?" — acknowledges they saw it, adds social proof |
| `clicked_no_book` | "You were so close" — references booking page visit directly, adds urgency |
| `bounced` | Do not send. Mark lead `undeliverable`. Flag in admin UI. No further sends. |

**Email 3 / SMS 3 (Day 8 trigger):**

| Lead state | Variant to send |
|---|---|
| `unopened` | Final attempt. Subject includes `{{first_name}}` prominently. Short copy, single CTA. |
| `opened_no_click` | Incentive or limited-time offer. Pull from campaign `custom_instructions` if one is set, otherwise use generic offer language. |
| `clicked_no_book` | "Is something stopping you?" — invite them to reply directly. Surfaces objections. |

Email 1 and Email 4 are not branched. Email 4 logic (re-engagement on cancellation/clicked-no-book post-Email 3) remains unchanged.

### Claude generation — updated prompt structure

When generating sequences at campaign creation, Claude now generates branch variants for each eligible email position in a **single API call per lead**.

The response must be a JSON object with exactly these keys:

```json
{
  "email1":            { "subject": "", "body": "" },
  "email2_unopened":   { "subject": "", "body": "" },
  "email2_opened":     { "subject": "", "body": "" },
  "email2_clicked":    { "subject": "", "body": "" },
  "email3_unopened":   { "subject": "", "body": "" },
  "email3_opened":     { "subject": "", "body": "" },
  "email3_clicked":    { "subject": "", "body": "" },
  "email4":            { "subject": "", "body": "" }
}
```

Update the generation prompt to request all variants. Pass the branch context to Claude — e.g. "email2_opened is sent to leads who opened Email 1 but did not click the booking link."

### Edge cases
- If `opened_at` tracking is unreliable for a lead (e.g. Apple Mail Privacy Protection flag is set), treat the lead as `opened_no_click` rather than `unopened`. Do not penalise them for a tracking limitation.
- SMS branching follows the same state logic. SMS has no `opened_at` — treat all SMS leads as `unopened` unless they clicked the booking link.

---

## Database changes

```sql
-- Migration: 0006_branching.sql
ALTER TABLE email_sends ADD COLUMN branch_variant varchar(30);
-- Stores which variant was sent, e.g. '2_opened_no_click', '3_clicked'
-- Used in analytics to compare branch path performance
-- Null for Email 1 and Email 4 (not branched)
```

---

## UI touchpoints

**Campaign preview screen (before Approve & Send)**
- Each email position (2 and 3) shows a tabbed or accordion UI
  - Tab labels: "Unopened variant" / "Opened variant" / "Clicked variant"
  - Admin can edit subject and body for each variant independently
  - Email 1 and Email 4 remain single-variant (no tabs)

**Lead detail view**
- Show current branch path: e.g. "Email 2 — Opened path" or "Email 3 — Clicked path"

**Campaign analytics**
- Add a branch funnel section: for Email 2 and Email 3, show how many leads went down each path
  - e.g. "Email 2: 80 unopened path · 45 opened path · 12 clicked path · 3 bounced"

---

---

# FEATURE 3 — A/B Testing for Subject Lines

## What it is

For any email step in a sequence, the admin can activate an A/B test on the subject line. The system splits leads 50/50, sends each variant to half, and after 4 hours automatically selects the winner based on open rate.

**Why this matters:** subject lines are the highest-leverage variable in email performance. A consistent 5–10% improvement in open rate compounds across every campaign. After 20+ campaigns you'll have empirical data on which subject line formulas work for each client type — a durable competitive advantage.

---

## Behaviour spec

### Test setup
- A/B toggle available on each email step in the campaign preview/edit screen
- When toggled on: subject line field splits into two inputs — Variant A and Variant B
- Admin fills in both (AI-generated suggestions provided for both by default)
- A badge "A/B Active" shows on that email step

### Send logic
- When an email step with A/B active is due to send, randomly assign each lead in that step to Variant A or Variant B (50/50)
- Store the assigned variant on the lead-email send record
- Send Variant A subject to their group, Variant B subject to the other
- Email body is identical for both variants

### Winner selection
Runs 4 hours after the first sends go out for that step:

1. Calculate open rate for Variant A and Variant B separately
2. If one variant leads by **more than 5 percentage points** AND has **at least 10 opens recorded** → mark as winner
3. If criteria not met → mark as `inconclusive`. Do not force a winner. Both variants remain as sent.
4. Log winner with: timestamp, Variant A open rate, Variant B open rate, total sends per variant

### Edge cases
- If a campaign has fewer than 20 leads in a step, A/B testing can still be activated but the result will almost always be `inconclusive`. Do not warn the admin — let them decide.
- For SMS: A/B testing is not applied to SMS in this version. SMS steps do not show the A/B toggle.

---

## Database changes

```sql
-- Migration: 0007_ab_testing.sql

-- Add to the email step / sequence step record
ALTER TABLE sequence_steps ADD COLUMN ab_test_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE sequence_steps ADD COLUMN subject_variant_a text;
ALTER TABLE sequence_steps ADD COLUMN subject_variant_b text;
ALTER TABLE sequence_steps ADD COLUMN ab_winner varchar(15);
-- 'A', 'B', or 'inconclusive'
ALTER TABLE sequence_steps ADD COLUMN ab_winner_selected_at timestamptz;
ALTER TABLE sequence_steps ADD COLUMN ab_variant_a_opens integer NOT NULL DEFAULT 0;
ALTER TABLE sequence_steps ADD COLUMN ab_variant_b_opens integer NOT NULL DEFAULT 0;
ALTER TABLE sequence_steps ADD COLUMN ab_variant_a_sends integer NOT NULL DEFAULT 0;
ALTER TABLE sequence_steps ADD COLUMN ab_variant_b_sends integer NOT NULL DEFAULT 0;

-- Add to the lead-email send record
ALTER TABLE email_sends ADD COLUMN ab_variant_assigned char(1);
-- 'A' or 'B'. Null if no A/B test was active for this step.
```

---

## UI touchpoints

**Campaign preview/edit screen**
- A/B toggle on each email step (Email only — not SMS)
- When active: subject field splits into "Variant A" and "Variant B" inputs side by side
- Badge: "A/B Active" on the step header

**Campaign detail page**
- Resolved tests: winner badge showing both open rates, e.g. "Variant A won · 34% vs 21% open rate"
- Unresolved/inconclusive: "A/B Inconclusive · 28% vs 26% — insufficient difference"
- Tests still running (within 4hr window): "A/B In Progress"

**Campaign analytics section**
- Per email step: A/B summary table — variant, sends, opens, open rate, winner status

---

---

# FEATURE 4 — List Health Score & Deliverability Dashboard

## What it is

A real-time health score (0–100) per campaign and per client, surfaced in an agency-wide deliverability view. The score degrades when deliverability signals worsen and automatically generates plain-English recommendations.

**Why this matters:** with multiple clients and hundreds of sends per day, a single client's poor-quality list can damage the agency's sending reputation for every other client. Catching this early — before Gmail starts filtering to spam — is critical to the agency's long-term viability.

---

## Behaviour spec

### Score calculation

Score starts at 100. Deductions applied per campaign. Recalculated daily by cron. Minimum score is 0.

| Condition | Deduction | Applied per event or once? |
|---|---|---|
| Hard bounce | −2 points | Per event |
| Unsubscribe | −1 point | Per event |
| Spam complaint (if detectable) | −5 points | Per event |
| Open rate below 10% | −10 points | Once (campaign level) |
| Open rate below 5% | −20 points | Once — replaces the −10 above, not cumulative |
| Click rate below 1% | −5 points | Once (campaign level) |
| >20% of sends hitting daily cap and queuing | −5 points | Once (campaign level) |

Client aggregate score = average of all campaign scores for that client, weighted by lead count.

### Health tiers

| Score | Tier | Indicator colour |
|---|---|---|
| 80–100 | Healthy | Green |
| 60–79 | Moderate | Amber |
| 0–59 | At Risk | Red |

### Recommendations engine

Based on active deductions, generate a plain-English recommendation per client. Store as JSON array. Regenerate when score changes. Examples:

```json
[
  {
    "trigger": "high_bounce_rate",
    "message": "Consider validating email addresses before the next campaign for this client. High bounce rates can trigger spam filters."
  },
  {
    "trigger": "low_open_rate",
    "message": "Subject lines for this client's campaigns are underperforming. Try more personalised or curiosity-driven subject lines."
  },
  {
    "trigger": "high_unsubscribe_rate",
    "message": "Leads may be too old or outreach frequency is too high. Consider reducing to 3 emails instead of 4."
  }
]
```

### Edge cases
- New campaigns with fewer than 10 sends: do not penalise for low open/click rate. Insufficient data. Apply bounce/unsubscribe deductions only.
- If a campaign is paused, freeze its score — do not recalculate until it resumes.

---

## Database changes

```sql
-- Migration: 0008_health_scores.sql

CREATE TABLE list_health_scores (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  campaign_id       uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  -- NULL campaign_id = client aggregate score
  score             integer NOT NULL,
  tier              varchar(10) NOT NULL, -- 'healthy', 'moderate', 'at_risk'
  bounce_count      integer NOT NULL DEFAULT 0,
  unsubscribe_count integer NOT NULL DEFAULT 0,
  complaint_count   integer NOT NULL DEFAULT 0,
  open_rate         decimal(5,2),
  click_rate        decimal(5,2),
  recommendations   jsonb,
  calculated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_health_scores_client ON list_health_scores(client_id, calculated_at);
CREATE INDEX idx_health_scores_campaign ON list_health_scores(campaign_id, calculated_at);
```

---

## UI touchpoints

**Client detail page**
- New "List Health" tab
- Large score number with tier colour, e.g. "74 — Moderate"
- 30-day trend sparkline (score over time)
- Recommendations list rendered from the JSON array

**Admin home dashboard**
- Small health badge on each client card: coloured dot + score number
- Sort clients by health score (lowest first) as default option

**New page: `/admin/deliverability`**
- Agency-wide view of all clients ranked by health score (lowest first)
- Summary row at top: total bounces, total unsubscribes, total at-risk campaigns across all clients
- Each row: client name, score, tier badge, bounce count, unsubscribe count, top recommendation
- Link to client detail from each row

**Campaign detail page**
- Health score for that specific campaign shown in the stats header
- If score < 60: show a prominent red warning banner at the top of the page with the top recommendation from the JSON array

---

---

# FEATURE 5 — Cross-Campaign Intelligence Dashboard

## What it is

A private admin-only analytics view aggregating performance data across all campaigns and clients. This is the agency's compounding learning asset — it gets more valuable with every campaign run and answers questions like "which tone converts best for trades businesses?" and "does Email+SMS outperform Email-only for bookings?"

**Why this matters:** most agencies run campaigns and move on. This dashboard means every campaign makes the next one smarter. After 50 campaigns you'll have empirical data on what works for every client type, tone, and channel — a genuine competitive edge.

---

## Behaviour spec

### Required new field

Add `client_industry` to the clients table (see database changes). Expose it as an editable dropdown on the client detail page with these options:

```
Trades
Cleaning
Health & Wellness
Hospitality
Retail
Professional Services
Other
```

This field is optional but recommended. Campaigns for clients without an industry set are included in "All" views but excluded from industry-specific breakdowns.

### Metrics by dimension

All metrics available with date range filter: Last 30 days / Last 90 days / Last 12 months / All time.

**By Tone Preset**
- Group campaigns by `tone_preset` field
- For each tone: avg open rate, avg click rate, avg booking rate, avg completion rate
- Number of campaigns in each group shown

**By Channel**
- Groups: Email only / SMS only / Email + SMS
- For each: avg open rate, avg booking rate, avg completion rate, avg time-from-send-to-booking (hours)

**By Industry**
- Same four metrics as above, grouped by `client_industry`
- Excludes clients with no industry set

**By Sequence Position**
- For each email position (1, 2, 3, 4): open rate, click rate, booking rate
- Drop-off funnel: % of leads who reached each step vs. enrolled
- Shows which email in the sequence drives the most bookings

**By Send Time**
- Open rates and click rates grouped by: day of week (Mon–Sun) and hour of day (0–23)
- Displayed as a heatmap table or grouped bar chart
- Highlight cells/bars that are >20% above the campaign average

**Top Subject Lines**
- Top 20 subject lines by open rate across all campaigns
- Show: subject line text, open rate, number of sends, campaign count (how many campaigns used it)
- Anonymised — no client name shown

**Top Email Bodies**
- Top 10 email body snippets by click-to-booking conversion rate
- Show first 100 characters of body, conversion rate, send count
- Anonymised — no client name shown

### Access control
This page is admin-only. It must not be accessible to clients under any circumstances. Add a server-side check on the route — do not rely on UI hiding alone.

---

## Database changes

```sql
-- Migration: 0009_intelligence.sql

-- Add industry to clients
ALTER TABLE clients ADD COLUMN client_industry varchar(50);

-- Performance indexes for dashboard queries
CREATE INDEX idx_lead_events_campaign_type_date
  ON lead_events(campaign_id, event_type, created_at);

CREATE INDEX idx_bookings_campaign_status_date
  ON bookings(campaign_id, status, created_at);

CREATE INDEX idx_campaigns_tone_date
  ON campaigns(tone_preset, created_at);

CREATE INDEX idx_campaigns_channel_date
  ON campaigns(channel, created_at);
```

No new tables required. The dashboard queries existing `lead_events`, `bookings`, `campaigns`, `leads`, and `clients` tables.

---

## UI touchpoints

**New page: `/admin/intelligence`**
- Admin only — server-side access check required
- Never linked from or visible in the client dashboard

Page layout:
```
[Date range filter: Last 30 days / 90 days / 12 months / All time]  [Export CSV]

[Headline stats row]
Total campaigns: 48 | Total leads contacted: 3,840 | Overall booking rate: 12.4% | Overall completion rate: 9.1%

[Tabs]
By Tone | By Channel | By Industry | By Sequence Position | By Send Time | Top Performers
```

- Each tab: data table + one Recharts bar or line chart
- Export button downloads the active tab's data as CSV
- Use Recharts (install if not already present — no other charting library)

**Client detail page (existing)**
- Add `client_industry` dropdown field (editable, admin only)

---

---

# Implementation checklist

Use this to track progress. Check off each item as it's completed.

## Feature 1 — RFM
- [ ] Migration `0005_rfm_scoring.sql`
- [ ] RFM scoring function (runs after CSV import)
- [ ] Wave assignment logic
- [ ] Wave-aware send scheduling in campaign cron
- [ ] CSV column mapper — optional RFM field mapping
- [ ] Campaign preview — wave summary block
- [ ] Lead list — RFM score badge and wave grouping

## Feature 2 — Branching
- [ ] Migration `0006_branching.sql`
- [ ] Behaviour state evaluation function (runs in daily cron)
- [ ] Branch routing logic in send cron
- [ ] Updated Claude generation prompt (all 8 variant keys)
- [ ] Updated generation response parser
- [ ] Campaign preview — tabbed variant editor
- [ ] Lead detail — current branch path display
- [ ] Campaign analytics — branch funnel

## Feature 3 — A/B Testing
- [ ] Migration `0007_ab_testing.sql`
- [ ] A/B send split logic (50/50 random assignment)
- [ ] Winner evaluation job (runs 4 hours after step sends)
- [ ] Campaign preview — A/B toggle and dual subject inputs
- [ ] Campaign detail — winner/inconclusive badges
- [ ] Campaign analytics — A/B results table per step

## Feature 4 — List Health Score
- [ ] Migration `0008_health_scores.sql`
- [ ] Score calculation function
- [ ] Daily cron integration
- [ ] Recommendations engine
- [ ] Client detail — List Health tab
- [ ] Admin home — health badge on client cards
- [ ] New page `/admin/deliverability`
- [ ] Campaign detail — score display + red warning banner

## Feature 5 — Intelligence Dashboard
- [ ] Migration `0009_intelligence.sql`
- [ ] Client detail — `client_industry` dropdown
- [ ] New page `/admin/intelligence` with server-side auth check
- [ ] Headline stats queries
- [ ] By Tone tab
- [ ] By Channel tab
- [ ] By Industry tab
- [ ] By Sequence Position tab
- [ ] By Send Time tab
- [ ] Top Performers tab
- [ ] CSV export per tab

---

## Environment variables to add to `.env.example`

```bash
# Feature flags — set to 'true' to enable, omit or set to 'false' to disable
FEATURE_RFM_ENABLED=true
FEATURE_BRANCHING_ENABLED=true
FEATURE_AB_TESTING_ENABLED=true
FEATURE_HEALTH_SCORE_ENABLED=true
FEATURE_INTELLIGENCE_ENABLED=true
```

---

## What not to touch

- The booking flow and Google Calendar integration
- The commission tracking, auto-complete, and dispute system
- The existing linear email send cron — extend it, do not rewrite it
- The Clerk auth configuration
- The existing campaign status flow: `draft → ready → active → paused → complete`
- The Reply-To header logic
- The unsubscribe token flow

---

*After all 5 features are implemented, create `CHANGES.md` in the project root listing every database change, new API route, new page, and new environment variable added.*
