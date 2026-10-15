package marketdata

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

func (s *Store) PendingNewsExtractions(ctx context.Context, limit int) ([]int64, error) {
	if limit < 1 || limit > 100 {
		return nil, errors.New("invalid news bridge batch")
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT e.id FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
 WHERE a.adapter='rss' AND lower(a.source_id) NOT IN('test-rss','real-rss') AND lower(a.source_id) NOT LIKE '%hacker%'
 AND lower(a.document_url) NOT LIKE '%news.ycombinator.com%' AND lower(a.document_url) NOT LIKE '%hnrss.org%'
 AND a.title IS NOT NULL AND btrim(a.title)<>'' AND e.text IS NOT NULL AND btrim(e.text)<>''
 AND NOT EXISTS(SELECT 1 FROM market.news_items n WHERE n.scraped_extraction_id=e.id
 OR lower(regexp_replace(split_part(n.article_url,'?',1),'/$',''))=lower(regexp_replace(split_part(a.document_url,'?',1),'/$','')))
 ORDER BY a.published_at DESC NULLS LAST,e.extracted_at DESC,e.id DESC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
func (s *Store) NewsExtraction(ctx context.Context, id int64) (json.RawMessage, error) {
	if id < 1 {
		return nil, errors.New("invalid news extraction")
	}
	rows, err := s.JSONRowsBounded(ctx, 20*1024*1024, `SELECT row_to_json(result) FROM (SELECT e.id AS "extractionId",e.confidence::float8 AS confidence,
 e.needs_review AS "needsReview",e.text,e.entity,a.id AS "artifactId",a.document_url AS "documentUrl",a.title,
 to_char(a.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "publishedAt",a.source_id AS "sourceId",COALESCE(s.name,a.source_id) AS "sourceName"
 FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id LEFT JOIN scraping.sources s ON s.id=a.source_id
 WHERE e.id=$1 AND a.adapter='rss') result`, id)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[0], nil
}
func (s *Store) NewsRevalidationRows(ctx context.Context, after string, limit int) ([]json.RawMessage, error) {
	if limit < 1 || limit > 16 {
		return nil, errors.New("invalid news revalidation page")
	}
	return s.JSONRowsBounded(ctx, 20*1024*1024, `SELECT row_to_json(result) FROM (SELECT n.id::text,n.headline,e.text AS "matchingText",n.excerpt,
 n.scraped_extraction_id AS "scrapedExtractionId",COALESCE(array_agg(DISTINCT links.security_id) FILTER(WHERE links.security_id IS NOT NULL),'{}') AS "securityIds"
 FROM market.news_items n LEFT JOIN scraping.extractions e ON e.id=n.scraped_extraction_id
 LEFT JOIN market.news_item_securities links ON links.news_item_id=n.id WHERE n.id>$1::bigint
 GROUP BY n.id,e.text ORDER BY n.id LIMIT $2) result`, after, limit)
}
func (s *Store) RepairNewsLinks(ctx context.Context, id string, extractionID *int64, headline string, links []string) (bool, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	var locked int64
	err = tx.QueryRowContext(ctx, `SELECT id FROM market.news_items WHERE id=$1::bigint AND scraped_extraction_id IS NOT DISTINCT FROM $2::bigint AND headline=$3 FOR UPDATE`, id, extractionID, headline).Scan(&locked)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if err := replaceNewsLinks(ctx, tx, locked, links); err != nil {
		return false, err
	}
	return true, tx.Commit()
}

func (s *Store) RecordNewsFailure(ctx context.Context, id int64) error {
	payload, err := json.Marshal(map[string]int64{"extractionId": id})
	if err != nil {
		return err
	}
	_, err = s.DB.ExecContext(ctx, `INSERT INTO market.dead_letters(exchange,dataset,symbol,payload,error,occurred_at)
 VALUES('NSE','news',NULL,$1::jsonb,'Native news mapping/persistence unavailable',now())`, string(payload))
	return err
}
func (s *Store) RecordNewsRun(ctx context.Context, started time.Time, processed, failed int) error {
	status := "success"
	if failed > 0 {
		status = "failed"
		if processed > failed {
			status = "partial"
		}
	}
	var messages any
	if failed > 0 {
		messages = `["Native news mapping/persistence unavailable"]`
	}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO market.ingestion_logs(exchange,dataset,status,record_count,error_count,started_at,finished_at,errors)
 VALUES('NSE','news',$1,$2,$3,$4,$5,$6::jsonb)`, status, processed-failed, failed, started, time.Now().UTC(), messages)
	return err
}
