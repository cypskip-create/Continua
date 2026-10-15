package marketdata

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

func (s *Store) PendingAnnouncementExtractions(ctx context.Context, limit int) ([]int64, error) {
	if limit < 1 || limit > 100 {
		return nil, errors.New("invalid announcement bridge batch")
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT e.id FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
 WHERE a.adapter<>'rss' AND NOT EXISTS(SELECT 1 FROM market.company_announcements ca WHERE ca.scraped_extraction_id=e.id)
 ORDER BY e.extracted_at ASC,e.id ASC LIMIT $1`, limit)
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
func (s *Store) AnnouncementExtraction(ctx context.Context, id int64) (json.RawMessage, error) {
	if id < 1 {
		return nil, errors.New("invalid announcement extraction")
	}
	rows, err := s.JSONRowsBounded(ctx, 20*1024*1024, `SELECT row_to_json(result) FROM (SELECT e.id AS "extractionId",e.confidence::float8 AS confidence,
 e.needs_review AS "needsReview",e.text,e.entity,a.id AS "artifactId",a.document_url AS "documentUrl",a.title,a.source_id AS "sourceId"
 FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id WHERE e.id=$1 AND a.adapter<>'rss') result`, id)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[0], nil
}
func (s *Store) CompanyDirectory(ctx context.Context, exchange string) ([]json.RawMessage, error) {
	if exchange != "NSE" {
		return nil, errors.New("invalid issuer exchange")
	}
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT c.id AS "companyId",c.name,s.id AS "securityId"
 FROM market.companies c JOIN market.securities s ON s.company_id=c.id AND s.exchange=$1) result`, exchange)
}
func (s *Store) RecordAnnouncementFailure(ctx context.Context, id int64) error {
	payload, _ := json.Marshal(map[string]int64{"extractionId": id})
	_, err := s.DB.ExecContext(ctx, `INSERT INTO market.dead_letters(exchange,dataset,symbol,payload,error,occurred_at)
 VALUES('NSE','announcement',NULL,$1::jsonb,'Native announcement mapping/persistence unavailable',now())`, string(payload))
	return err
}
func (s *Store) RecordAnnouncementRun(ctx context.Context, started time.Time, processed, failed int) error {
	status := "success"
	if failed > 0 {
		status = "failed"
		if processed > failed {
			status = "partial"
		}
	}
	var messages any
	if failed > 0 {
		messages = `["Native announcement mapping/persistence unavailable"]`
	}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO market.ingestion_logs(exchange,dataset,status,record_count,error_count,started_at,finished_at,errors)
 VALUES('NSE','announcement',$1,$2,$3,$4,$5,$6::jsonb)`, status, processed-failed, failed, started, time.Now().UTC(), messages)
	return err
}
