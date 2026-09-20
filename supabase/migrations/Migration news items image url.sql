-- ═══════════════════════════════════════════════════════════════════════
-- market.news_items.image_url — og:image (or twitter:image) captured off
-- the article page during RSS extraction (see
-- scraper/src/adapters/rss/createRssFeedAdapter.ts's extractImageUrl()),
-- carried through backend/src/ingestion/pipelines/newsIngestionPipeline.ts.
-- Nullable: most publishers set one, some don't, and this column should
-- never be backfilled with anything guessed — a missing thumbnail in the
-- UI just falls back to a placeholder.
--
-- Run this manually in the Supabase SQL Editor, same as every other
-- migration in this schema — there is no automated migration runner.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE market.news_items ADD COLUMN IF NOT EXISTS image_url text;