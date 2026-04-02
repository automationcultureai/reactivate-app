ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS external_booking_url TEXT;

COMMENT ON COLUMN campaigns.external_booking_url IS
'Optional external booking URL (Mindbody, Acuity, Vagaro etc).
When set, click tracking redirects leads here instead of the
internal booking page.';
