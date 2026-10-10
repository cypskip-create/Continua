-- Downloads survive restarts; source URL + content hashes preserve provenance.
CREATE TABLE IF NOT EXISTS scraping.document_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id text NOT NULL REFERENCES scraping.sources(id),
  url text NOT NULL,
  document jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','complete','failed')),
  attempts integer NOT NULL DEFAULT 0,
  lease_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  error_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id,url)
);
CREATE INDEX IF NOT EXISTS document_jobs_pending ON scraping.document_jobs(source_id,next_attempt_at) WHERE status <> 'complete';
ALTER TABLE scraping.document_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scraping.document_jobs FROM anon, authenticated;
CREATE TABLE IF NOT EXISTS scraping.archive_checkpoints (
  source_id text NOT NULL REFERENCES scraping.sources(id),
  archive_url text NOT NULL,
  archive_year integer NOT NULL CHECK(archive_year >= 2015),
  pages integer[] NOT NULL DEFAULT '{1}',
  completed_pages integer[] NOT NULL DEFAULT '{}',
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(source_id,archive_url,archive_year)
);
ALTER TABLE scraping.archive_checkpoints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scraping.archive_checkpoints FROM anon, authenticated;
-- Keep historical instrument statistics separate from issuer financials.
ALTER TABLE market.research_records DROP CONSTRAINT IF EXISTS research_records_kind_check;
ALTER TABLE market.research_records ADD CONSTRAINT research_records_kind_check
  CHECK (kind IN ('ipo','macro','economic','bond','derivative','usp','market_statistics'));
CREATE TABLE IF NOT EXISTS market.price_history_sources (
  security_id text NOT NULL REFERENCES market.securities(id),
  bar_time timestamptz NOT NULL,
  source_url text NOT NULL CHECK(source_url LIKE 'https://%'),
  permission_reference text NOT NULL,
  adjustment text NOT NULL CHECK(adjustment='unadjusted'),
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(security_id,bar_time,source_url)
);
ALTER TABLE market.price_history_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON market.price_history_sources FROM anon,authenticated;
-- Server-side access only. Raw PDFs must survive scraper deploys/restarts.
INSERT INTO storage.buckets(id,name,public) VALUES('scraper-raw','scraper-raw',false)
ON CONFLICT(id) DO UPDATE SET public=false;
-- Preserve stored data, but pause existing summary collection until permission arrives.
UPDATE scraping.sources SET config=config || '{"requiresCommercialPermission":true}'::jsonb,
  enabled=CASE WHEN NULLIF(trim(config->>'permissionReference'),'') IS NULL THEN false ELSE enabled END
  WHERE id='nse-index-summary';
