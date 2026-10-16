BEGIN;
CREATE TABLE IF NOT EXISTS scraping.processed_research (
 extraction_id bigint NOT NULL REFERENCES scraping.extractions(id) ON DELETE CASCADE,
 processor_version text NOT NULL,
 security_id text REFERENCES market.securities(id),
 destination text NOT NULL,
 status text NOT NULL CHECK(status IN ('publisher_observation','review_required','empty','blocked')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 processed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(extraction_id,processor_version)
);
CREATE INDEX IF NOT EXISTS processed_research_issuer ON scraping.processed_research(security_id,destination,processed_at DESC);
ALTER TABLE scraping.processed_research ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scraping.processed_research FROM anon,authenticated;
COMMIT;
