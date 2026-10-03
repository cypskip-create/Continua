-- Re-run every scraped extraction through the stricter relevance/entity
-- rules. Raw artifacts remain intact; company news is re-linked and broader
-- finance/economy news remains available without retaining false ticker tags.
DELETE FROM market.news_item_securities
WHERE news_item_id IN (
  SELECT id FROM market.news_items WHERE scraped_extraction_id IS NOT NULL
);

DELETE FROM market.news_items WHERE scraped_extraction_id IS NOT NULL;
