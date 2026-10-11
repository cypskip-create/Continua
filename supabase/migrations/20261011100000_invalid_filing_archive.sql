-- Preserve invalid legacy periods in full before a source-backed repair.
-- No rows are changed automatically: repairs require explicit operator review.
CREATE TABLE IF NOT EXISTS market.invalid_filing_archive (
  period_id text PRIMARY KEY,
  archived_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  original_bundle jsonb NOT NULL,
  replacement_source_url text
);
ALTER TABLE market.invalid_filing_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON market.invalid_filing_archive FROM anon, authenticated;
