-- Test RSS fixtures must never appear in the production TradersHub media
-- feed. Runtime filtering provides immediate protection; this migration also
-- removes the old rows and disables matching scraper sources at rest.
DO $$
BEGIN
  IF to_regclass('market.news_items') IS NOT NULL THEN
    DELETE FROM market.news_item_securities
    WHERE news_item_id IN (
      SELECT id FROM market.news_items
      WHERE lower(source) LIKE '%hacker%'
         OR lower(source_name) LIKE '%hacker news%'
         OR lower(article_url) LIKE '%news.ycombinator.com%'
         OR lower(article_url) LIKE '%hnrss.org%'
         OR lower(source) IN ('test-rss', 'real-rss')
    );

    DELETE FROM market.news_items
    WHERE lower(source) LIKE '%hacker%'
       OR lower(source_name) LIKE '%hacker news%'
       OR lower(article_url) LIKE '%news.ycombinator.com%'
       OR lower(article_url) LIKE '%hnrss.org%'
       OR lower(source) IN ('test-rss', 'real-rss');
  END IF;

  IF to_regclass('scraping.sources') IS NOT NULL THEN
    UPDATE scraping.sources
    SET enabled = false, updated_at = now()
    WHERE lower(id) LIKE '%hacker%'
       OR lower(name) LIKE '%hacker news%'
       OR lower(id) IN ('test-rss', 'real-rss')
       OR lower(config::text) LIKE '%news.ycombinator.com%'
       OR lower(config::text) LIKE '%hnrss.org%';
  END IF;
END $$;
