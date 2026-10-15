-- Native candidate only. Apply and verify before native publication activation.
BEGIN;
CREATE TABLE IF NOT EXISTS market.native_research_refresh (
 security_id text PRIMARY KEY REFERENCES market.securities(id),
 symbol text NOT NULL,
 requested_version bigint NOT NULL DEFAULT 1 CHECK (requested_version > 0),
 requested_at timestamptz NOT NULL DEFAULT now(),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 lease_token text,
 lease_until timestamptz,
 last_error text,
 CHECK ((lease_token IS NULL) = (lease_until IS NULL))
);
CREATE INDEX IF NOT EXISTS native_research_refresh_due ON market.native_research_refresh(next_attempt_at,lease_until);
ALTER TABLE market.native_research_refresh ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON market.native_research_refresh FROM anon,authenticated;
COMMIT;
