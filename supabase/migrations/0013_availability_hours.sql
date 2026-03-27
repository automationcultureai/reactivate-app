-- Add per-client booking availability hours
-- Shape: {"timezone":"Australia/Sydney","days":[1,2,3,4,5],"start_hour":9,"end_hour":17}
-- NULL = use application default (Mon–Fri 9–17 AEST)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS availability_hours JSONB DEFAULT NULL;
