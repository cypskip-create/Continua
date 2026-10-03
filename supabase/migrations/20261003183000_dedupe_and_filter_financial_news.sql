-- Remove known non-financial false positives created by page-navigation text
-- matching NSE tickers, then collapse repeat crawl rows by canonical URL.
DELETE FROM market.news_items
WHERE lower(coalesce(headline, '') || ' ' || coalesce(excerpt, '')) ~
  '(road accident|car crash|bus crash|crash leaves|pilgrims? dead|murder|football|celebrity|entertainment|church service|obituary)';

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY lower(regexp_replace(split_part(article_url, '?', 1), '/$', ''))
           ORDER BY published_at DESC NULLS LAST, created_at DESC
         ) AS position
  FROM market.news_items
)
DELETE FROM market.news_items n
USING ranked r
WHERE n.id = r.id AND r.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS news_items_canonical_article_url_unique
  ON market.news_items (lower(regexp_replace(split_part(article_url, '?', 1), '/$', '')));
