-- Only reviewed official observations reach public research screens. No placeholder rates or forecasts.
CREATE TABLE IF NOT EXISTS market.research_records (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('ipo','macro','economic','bond')),
  title text NOT NULL,
  symbol text,
  observed_at timestamptz NOT NULL,
  source_url text NOT NULL CHECK (source_url LIKE 'https://%'),
  payload jsonb NOT NULL,
  verified_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS research_records_kind_date ON market.research_records(kind, observed_at DESC);
ALTER TABLE market.research_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON market.research_records FROM anon, authenticated;
COMMENT ON TABLE market.research_records IS 'Official NSE/CMA IPO announcements, KNBS macro releases and CBK government debt observations; published via authenticated Data API only.';
