-- Track first welcome email send.
-- Used by GET /api/v1/portfolio to fire a one-time welcome email after the
-- user's first auth-gated API call, then stamp the column so it never re-fires.
-- Migration applied to remote: 20260508180255 (add_welcomed_at_to_profiles).

ALTER TABLE frontier_profiles ADD COLUMN IF NOT EXISTS welcomed_at TIMESTAMPTZ;
