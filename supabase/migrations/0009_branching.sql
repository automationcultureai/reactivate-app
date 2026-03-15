-- supabase/migrations/0009_branching.sql
-- Adds branch_variant column and replaces the unique constraint on emails
-- to support 3-path branching for Email 2 and Email 3.
--
-- branch_variant values:
--   NULL          → Email 1 and Email 4 (single, no branching)
--   '2_unopened'  → Email 2 path: lead never opened Email 1
--   '2_opened'    → Email 2 path: lead opened Email 1 but didn't click
--   '2_clicked'   → Email 2 path: lead clicked Email 1 but didn't book
--   '3_unopened'  → Email 3 path: lead never opened Email 2
--   '3_opened'    → Email 3 path: lead opened Email 2 but didn't click
--   '3_clicked'   → Email 3 path: lead clicked Email 2 but didn't book

ALTER TABLE emails ADD COLUMN branch_variant varchar(30);

-- Drop old unique constraint (only covered lead_id + sequence_number, allowing one email per step)
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_lead_id_sequence_number_key;

-- Partial unique index for rows WITHOUT a variant (Email 1 and Email 4)
-- Ensures each lead still has exactly one Email 1 and one Email 4.
CREATE UNIQUE INDEX emails_unique_no_variant
  ON emails (lead_id, sequence_number)
  WHERE branch_variant IS NULL;

-- Partial unique index for rows WITH a variant (Email 2 and Email 3 branches)
-- Ensures each lead has at most one of each variant (e.g. one '2_unopened' per lead).
CREATE UNIQUE INDEX emails_unique_with_variant
  ON emails (lead_id, sequence_number, branch_variant)
  WHERE branch_variant IS NOT NULL;
