-- Additive scheduler state only. No existing objects or records are removed.
BEGIN;
CREATE TABLE IF NOT EXISTS scraping.scheduled_transfer_days (
  day date PRIMARY KEY,
  reserved_bytes bigint NOT NULL CHECK (reserved_bytes>=0)
);
CREATE TABLE IF NOT EXISTS scraping.scheduled_runs (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('news','documents','drain')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('running','completed','failed','budget-paused')),
  receipt jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE scraping.scheduled_transfer_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping.scheduled_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scraping.scheduled_transfer_days,scraping.scheduled_runs FROM PUBLIC;
COMMIT;
