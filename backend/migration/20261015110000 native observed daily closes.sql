-- Close-only publisher observations are not OHLC candles. Never manufacture
-- opening prices, high/low ranges or trading volume to fit market.candles.
CREATE TABLE IF NOT EXISTS market.observed_daily_closes (
 security_id text NOT NULL REFERENCES market.securities(id),
 observed_date date NOT NULL,
 source_id text NOT NULL REFERENCES scraping.sources(id),
 close numeric NOT NULL CHECK(close>0),
 volume bigint CHECK(volume>=0),
 adjustment text NOT NULL CHECK(adjustment IN('unadjusted','adjusted','unknown')),
 artifact_id bigint NOT NULL REFERENCES scraping.raw_artifacts(id),
 extraction_id bigint NOT NULL REFERENCES scraping.extractions(id),
 source_url text NOT NULL CHECK(source_url LIKE 'https://%'),
 published_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(security_id,observed_date,source_id)
);
CREATE INDEX IF NOT EXISTS observed_daily_closes_lookup ON market.observed_daily_closes(security_id,observed_date DESC);
ALTER TABLE market.observed_daily_closes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON market.observed_daily_closes FROM anon,authenticated;
CREATE TABLE IF NOT EXISTS market.close_publication_receipts (
 extraction_id bigint PRIMARY KEY REFERENCES scraping.extractions(id),
 source_id text NOT NULL REFERENCES scraping.sources(id),
 basis text NOT NULL CHECK(basis ~ '^[a-f0-9]{32}$'),
 completed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE market.close_publication_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON market.close_publication_receipts FROM anon,authenticated;
