package marketdata

import (
	"context"
	"encoding/json"
	"errors"
)

const trustedNewsFilter = `lower(n.source) NOT LIKE '%hacker%' AND lower(n.source_name) NOT LIKE '%hacker news%'
 AND lower(n.article_url) NOT LIKE '%news.ycombinator.com%' AND lower(n.article_url) NOT LIKE '%hnrss.org%'
 AND lower(n.source) NOT IN('test-rss','real-rss')
 AND lower(coalesce(n.headline,'') || ' ' || coalesce(n.excerpt,'')) !~ '(road accident|car crash|bus crash|crash leaves|pilgrims? dead|murder|football|celebrity|entertainment|church service|obituary)'`

func (s *Store) NewsDirectory(ctx context.Context, exchange string) ([]json.RawMessage, error) {
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT s.id AS "securityId",s.symbol,c.name AS "companyName" FROM market.securities s JOIN market.companies c ON c.id=s.company_id WHERE s.exchange=$1) result`, exchange)
}

// Read at most one small batch of full immutable prose. Do not load hundreds
// of article bodies together or truncate away issuer evidence silently.
const newsCandidatesSQL = `SELECT row_to_json(result) FROM (SELECT n.id::text,n.headline,n.excerpt,e.text AS "matchingText",n.article_url AS "articleUrl",
 n.source,n.source_name AS "sourceName",n.category,n.image_url AS "imageUrl",n.scraped_artifact_id AS "scrapedArtifactId",n.scraped_extraction_id AS "scrapedExtractionId",
 n.extraction_confidence AS "extractionConfidence",n.needs_review AS "needsReview",to_char(n.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "publishedAt"
 FROM market.news_items n LEFT JOIN scraping.extractions e ON e.id=n.scraped_extraction_id
 WHERE ` + trustedNewsFilter + ` AND ($2::text IS NULL OR n.category=$2)
 AND ($1::text IS NULL OR n.id IN(SELECT historical.id FROM market.news_items historical JOIN market.news_item_securities links ON links.news_item_id=historical.id
 WHERE links.security_id=$1 ORDER BY historical.published_at DESC NULLS LAST,historical.created_at DESC LIMIT 400)
 OR n.id IN(SELECT id FROM market.news_items ORDER BY published_at DESC NULLS LAST,created_at DESC LIMIT 400))
 ORDER BY n.published_at DESC NULLS LAST,n.created_at DESC,n.id DESC LIMIT $3 OFFSET $4) result`

// Stream one ordered query instead of re-sorting/re-transferring candidate
// windows for each OFFSET. Only the current 128-row/16 MiB page is retained.
// The callback is synchronous and cancellation closes the cursor/connection.
func (s *Store) StreamNewsCandidates(ctx context.Context, securityID, category *string, limit int, consume func([]json.RawMessage) error) error {
	if limit < 1 || limit > 800 || consume == nil {
		return errors.New("invalid news stream")
	}
	rows, err := s.DB.QueryContext(ctx, newsCandidatesSQL, securityID, category, limit, 0)
	if err != nil {
		return err
	}
	defer rows.Close()
	batch := make([]json.RawMessage, 0, 128)
	size := 0
	flush := func() error {
		if len(batch) == 0 {
			return nil
		}
		err := consume(batch)
		batch = make([]json.RawMessage, 0, 128)
		size = 0
		return err
	}
	for rows.Next() {
		if err := ctx.Err(); err != nil {
			return err
		}
		var raw json.RawMessage
		if err := rows.Scan(&raw); err != nil {
			return err
		}
		if len(raw) > 16*1024*1024 {
			return ErrReadBudget
		}
		if len(batch) == 128 || size+len(raw) > 16*1024*1024 {
			if err := flush(); err != nil {
				return err
			}
		}
		batch = append(batch, append(json.RawMessage(nil), raw...))
		size += len(raw)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return flush()
}

func (s *Store) NewsCandidates(ctx context.Context, securityID, category *string, batch, offset int) ([]json.RawMessage, error) {
	if batch < 1 || batch > 128 || offset < 0 || offset > 800 {
		return nil, errors.New("invalid news candidate page")
	}
	return s.JSONRowsBounded(ctx, 16*1024*1024, `SELECT row_to_json(result) FROM (SELECT n.id::text,n.headline,n.excerpt,e.text AS "matchingText",n.article_url AS "articleUrl",
 n.source,n.source_name AS "sourceName",n.category,n.image_url AS "imageUrl",n.scraped_artifact_id AS "scrapedArtifactId",n.scraped_extraction_id AS "scrapedExtractionId",
 n.extraction_confidence AS "extractionConfidence",n.needs_review AS "needsReview",to_char(n.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "publishedAt"
 FROM market.news_items n LEFT JOIN scraping.extractions e ON e.id=n.scraped_extraction_id
 WHERE `+trustedNewsFilter+` AND ($2::text IS NULL OR n.category=$2)
 AND ($1::text IS NULL OR n.id IN(SELECT historical.id FROM market.news_items historical JOIN market.news_item_securities links ON links.news_item_id=historical.id
 WHERE links.security_id=$1 ORDER BY historical.published_at DESC NULLS LAST,historical.created_at DESC LIMIT 400)
 OR n.id IN(SELECT id FROM market.news_items ORDER BY published_at DESC NULLS LAST,created_at DESC LIMIT 400))
 ORDER BY n.published_at DESC NULLS LAST,n.created_at DESC,n.id DESC LIMIT $3 OFFSET $4) result`, securityID, category, batch, offset)
}
func (s *Store) NewsArticle(ctx context.Context, id string) (json.RawMessage, error) {
	rows, err := s.JSONRowsBounded(ctx, 20*1024*1024, `SELECT row_to_json(result) FROM (SELECT n.id::text,n.headline,n.excerpt,e.text AS "matchingText",e.text AS content,n.article_url AS "articleUrl",
 n.source,n.source_name AS "sourceName",n.category,n.image_url AS "imageUrl",n.scraped_artifact_id AS "scrapedArtifactId",n.scraped_extraction_id AS "scrapedExtractionId",
 n.extraction_confidence AS "extractionConfidence",n.needs_review AS "needsReview",to_char(n.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "publishedAt"
 FROM market.news_items n LEFT JOIN scraping.extractions e ON e.id=n.scraped_extraction_id WHERE `+trustedNewsFilter+` AND n.id=$1::bigint LIMIT 1) result`, id)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[0], nil
}
