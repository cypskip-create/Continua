package marketdata

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"
)

var auditExchange = regexp.MustCompile(`^[A-Z0-9]{2,12}$`)
var auditErrorCodes = map[string]bool{"validation-failed": true, "collection-failed": true, "normalization-failed": true, "persistence-failed": true, "ownership-collection-failed": true, "publication-failed": true, "timeout": true, "cancelled": true, "source-unavailable": true, "source-permission-revoked": true, "record-too-large": true, "unexpected-failure": true}
var auditDatasets = map[string]bool{"price": true, "candle": true, "company": true, "financials": true, "corporate_action": true, "earnings": true, "ownership": true, "index": true, "announcement": true, "financial_statement_candidate": true, "news": true}

type IngestionRun struct {
	Exchange, Dataset, Status string
	RecordCount, ErrorCount   int
	StartedAt, FinishedAt     time.Time
	// Stable non-sensitive codes, never SDK exception strings or credentials.
	Errors []string
}
type DeadLetter struct {
	Exchange, Dataset string
	Symbol            *string
	Payload           json.RawMessage
	ErrorCode         string
}

func (s *Store) RecordIngestionRun(ctx context.Context, r IngestionRun) error {
	if !auditExchange.MatchString(r.Exchange) || !auditDatasets[r.Dataset] || !map[string]bool{"success": true, "partial": true, "failed": true}[r.Status] || r.RecordCount < 0 || r.ErrorCount < 0 || r.RecordCount > 1000000000 || r.ErrorCount > 1000000000 || r.StartedAt.IsZero() || r.FinishedAt.Before(r.StartedAt) || len(r.Errors) > 20 {
		return errors.New("invalid ingestion audit")
	}
	if r.Status == "success" && r.ErrorCount != 0 {
		return errors.New("failed records cannot be logged as success")
	}
	for _, code := range r.Errors {
		if !auditErrorCodes[code] {
			return errors.New("non-sensitive audit error code required")
		}
	}
	var encoded any
	if len(r.Errors) > 0 {
		body, _ := json.Marshal(r.Errors)
		encoded = string(body)
	}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO market.ingestion_logs(exchange,dataset,status,record_count,error_count,started_at,finished_at,errors) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, r.Exchange, r.Dataset, r.Status, r.RecordCount, r.ErrorCount, r.StartedAt, r.FinishedAt, encoded)
	return err
}

func (s *Store) RecordDeadLetter(ctx context.Context, r DeadLetter) error {
	if !auditExchange.MatchString(r.Exchange) || !auditDatasets[r.Dataset] || r.Dataset == "company" || len(r.Payload) > 1048576 || !json.Valid(r.Payload) || !auditErrorCodes[r.ErrorCode] {
		return errors.New("invalid dead-letter audit")
	}
	if r.Symbol != nil && (len(*r.Symbol) > 100 || strings.ContainsAny(*r.Symbol, "\r\n\x00")) {
		return errors.New("invalid dead-letter symbol")
	}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO market.dead_letters(exchange,dataset,symbol,payload,error,occurred_at) VALUES($1,$2,$3,$4::jsonb,$5,now())`, r.Exchange, r.Dataset, r.Symbol, string(r.Payload), r.ErrorCode)
	return err
}

// Retains the legacy sequential receipt boundary: an error does not silently
// discard earlier successfully persisted failure records.
func (s *Store) RecordDeadLetters(ctx context.Context, records []DeadLetter) error {
	if len(records) > 1000 {
		return errors.New("dead-letter batch budget exceeded")
	}
	for _, record := range records {
		if err := s.RecordDeadLetter(ctx, record); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) RecentIngestionRuns(ctx context.Context, limit int) ([]json.RawMessage, error) {
	if limit == 0 {
		limit = 50
	}
	if limit < 1 || limit > 100 {
		return nil, errors.New("invalid audit read limit")
	}
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT id,exchange,dataset,status,record_count AS "recordCount",error_count AS "errorCount",to_char(started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startedAt",to_char(finished_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "finishedAt",errors FROM market.ingestion_logs ORDER BY started_at DESC,id DESC LIMIT $1) result`, limit)
}
func (s *Store) RecentDeadLetters(ctx context.Context, limit int) ([]json.RawMessage, error) {
	if limit == 0 {
		limit = 100
	}
	if limit < 1 || limit > 100 {
		return nil, errors.New("invalid dead-letter read limit")
	}
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT id,exchange,dataset,symbol,payload,error,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "occurredAt" FROM market.dead_letters ORDER BY occurred_at DESC,id DESC LIMIT $1) result`, limit)
}
