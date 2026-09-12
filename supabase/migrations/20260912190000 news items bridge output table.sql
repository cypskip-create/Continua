-- ═══════════════════════════════════════════════════════════════════════
-- market.news_items — bridge output table for general market/business
-- news (see backend/src/workers/newsWorker.ts and
-- backend/src/storage/repositories/newsRepository.ts).
-- ═══════════════════════════════════════════════════════════════════════
-- This table has been referenced by newsRepository.ts since the news
-- bridge was built, but the CREATE TABLE for it was never committed as a
-- migration (unlike market.company_announcements and
-- market.financial_statement_candidates, which are ALSO missing a
-- committed migration but were apparently applied by hand against
-- production at some point — this one wasn't). Written from the exact
-- columns/queries newsRepository.ts already depends on.
--
-- Conventions matched to the rest of this schema:
--   - bigint identity primary key, matching market.ingestion_logs and the
--     scraping-schema bridge-source tables (scraping.extractions,
--     scraping.raw_artifacts, scraping.dead_letters).
--   - security_id is `text` referencing market.securities(id), which is
--     itself a natural key like 'NSE:SCOM' (030_market_schema.sql).
--   - scraped_artifact_id / scraped_extraction_id are plain bigint
--     columns, NOT foreign keys into `scraping.*` — per the scraping
--     migration's own stated rule ("this backend's migrations never
--     touch market.* or public.*, and vice versa"), market's migrations
--     return the favor and don't reach into `scraping.*` either.
--
-- Run this manually in the Supabase SQL Editor (same as every other
-- migration in this schema — there is no automated migration runner).

CREATE TABLE IF NOT EXISTS market.news_items (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  headline               text NOT NULL,
  excerpt                text,
  article_url            text NOT NULL,
  source                 text NOT NULL,
  source_name            text NOT NULL,
  category               text NOT NULL CHECK (category IN ('markets','earnings','companies','economy','top')),
  scraped_artifact_id    bigint,
  scraped_extraction_id  bigint NOT NULL UNIQUE,
  extraction_confidence  numeric,
  needs_review           boolean NOT NULL DEFAULT false,
  published_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_news_items_published ON market.news_items(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_news_items_category ON market.news_items(category);

-- ── News item <-> security mentions (many-to-many) ──────────────────────
-- Wholesale delete + re-insert on every upsert (see newsRepository.ts),
-- so no need for an updated_at column here — rows are always fresh.

CREATE TABLE IF NOT EXISTS market.news_item_securities (
  news_item_id  bigint NOT NULL REFERENCES market.news_items(id) ON DELETE CASCADE,
  security_id   text NOT NULL REFERENCES market.securities(id),
  PRIMARY KEY (news_item_id, security_id)
);
CREATE INDEX IF NOT EXISTS idx_news_item_securities_security ON market.news_item_securities(security_id);