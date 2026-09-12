-- ═══════════════════════════════════════════════════════════════════════
-- News bridge — the same pattern as "company announcements bridge.sql",
-- applied to general market/business news picked up via continua-scraper's
-- generic RSS adapter (adapter = 'rss' in scraping.sources), instead of
-- NSE's own announcement PDFs (adapter = 'nse', already bridged separately
-- into market.company_announcements).
--
-- Kept as its own table rather than reusing company_announcements because
-- the shape is genuinely different: a news article can legitimately
-- mention several companies (many-to-many, via news_item_securities),
-- whereas an NSE announcement is filed by exactly one company. Forcing
-- news into the single-security shape would mean either duplicating a
-- multi-company article once per mentioned company or arbitrarily picking
-- one — both worse than a proper junction table.
--
-- Category and stock-mention detection are both heuristic (keyword
-- matching — see resolveStockMentions.ts / classifyNewsCategory.ts), not a
-- verified NLP classification. needs_review is set honestly whenever an
-- article couldn't be tied to any known security, same "don't fabricate
-- a match" principle as resolveCompanyEntity — an article with zero
-- resolved mentions is still stored and shown (general market/economy
-- news is legitimately company-less), just flagged so it's not confused
-- with a confidently-tagged one.
--
-- Run this manually in the Supabase SQL Editor, same as every other
-- Continua migration.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS market.news_items (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  headline               text NOT NULL,
  -- Short preview only — full body stays in scraping.extractions, same
  -- reasoning as company_announcements.excerpt.
  excerpt                text,

  article_url            text NOT NULL,
  source                 text NOT NULL,          -- 'capitalfm-business', matches scraping.sources.id
  source_name            text NOT NULL,          -- human-readable, e.g. "Capital FM Business"

  -- Heuristic keyword classification (classifyNewsCategory.ts) — best
  -- effort, not a guarantee. 'markets' is the honest catch-all default.
  category               text NOT NULL DEFAULT 'markets'
                           CHECK (category IN ('markets','earnings','companies','economy','top')),

  -- Traceability back to the scraper's own records, same as every other
  -- bridge in this project.
  scraped_artifact_id    bigint REFERENCES scraping.raw_artifacts(id),
  scraped_extraction_id  bigint UNIQUE REFERENCES scraping.extractions(id),

  extraction_confidence  numeric,
  needs_review           boolean NOT NULL DEFAULT false,

  published_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_items_published ON market.news_items(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_news_items_category ON market.news_items(category, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_items_review ON market.news_items(needs_review) WHERE needs_review;

-- Many-to-many: one article can mention several securities, one security
-- is mentioned by many articles.
CREATE TABLE IF NOT EXISTS market.news_item_securities (
  news_item_id  bigint NOT NULL REFERENCES market.news_items(id) ON DELETE CASCADE,
  security_id   text   NOT NULL REFERENCES market.securities(id),
  PRIMARY KEY (news_item_id, security_id)
);
CREATE INDEX IF NOT EXISTS idx_news_item_securities_security ON market.news_item_securities(security_id);

-- Extend the ingestion_logs / dead_letters dataset CHECKs (same pattern as
-- every prior bridge) to cover this bridge's own logging.
ALTER TABLE market.ingestion_logs DROP CONSTRAINT IF EXISTS ingestion_logs_dataset_check;
ALTER TABLE market.ingestion_logs ADD CONSTRAINT ingestion_logs_dataset_check
  CHECK (dataset IN ('price','candle','company','financials','corporate_action','earnings','ownership','index','announcement','financial_statement_candidate','news'));

ALTER TABLE market.dead_letters DROP CONSTRAINT IF EXISTS dead_letters_dataset_check;
ALTER TABLE market.dead_letters ADD CONSTRAINT dead_letters_dataset_check
  CHECK (dataset IN ('price','candle','financials','corporate_action','earnings','ownership','index','announcement','financial_statement_candidate','news'));