package marketdata

import (
	"context"
	"encoding/json"
	"errors"
)

const candidateColumns = `id::text,company_id AS "companyId",security_id AS "securityId",raw_company_name AS "rawCompanyName",
 source,exchange,document_url AS "documentUrl",document_title AS "documentTitle",table_index AS "tableIndex",
 detected_table AS "detectedTable",detection_confidence::float8 AS "detectionConfidence",scraped_artifact_id AS "scrapedArtifactId",
 scraped_extraction_id AS "scrapedExtractionId",status,reviewed_at AS "reviewedAt",reviewed_note AS "reviewedNote",
 resulting_period_id AS "resultingPeriodId",created_at AS "createdAt"`

func (s *Store) PendingCandidates(ctx context.Context, limit int) ([]json.RawMessage, error) {
	if limit < 1 || limit > 100 {
		return nil, errors.New("invalid review limit")
	}
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT `+candidateColumns+` FROM market.financial_statement_candidates WHERE status='pending' ORDER BY created_at ASC,id ASC LIMIT $1) result`, limit)
}
func (s *Store) Candidate(ctx context.Context, id string) (json.RawMessage, error) {
	rows, err := s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT `+candidateColumns+` FROM market.financial_statement_candidates WHERE id=$1) result`, id)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[0], nil
}

var ErrCandidateReviewed = errors.New("candidate already reviewed")

// Row locking prevents discarding a concurrently confirmed filing.
func (s *Store) RejectCandidate(ctx context.Context, id string, note *string) error {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var status string
	err = tx.QueryRowContext(ctx, `SELECT status FROM market.financial_statement_candidates WHERE id=$1 FOR UPDATE`, id).Scan(&status)
	if err != nil {
		return err
	}
	if status != "pending" {
		return ErrCandidateReviewed
	}
	_, err = tx.ExecContext(ctx, `UPDATE market.financial_statement_candidates SET status='rejected',reviewed_at=now(),reviewed_note=$2,resulting_period_id=NULL,updated_at=now() WHERE id=$1`, id, note)
	if err != nil {
		return err
	}
	return tx.Commit()
}
func (s *Store) AdminSecurities(ctx context.Context, exchange string) ([]json.RawMessage, error) {
	if exchange != "NSE" {
		return nil, errors.New("invalid exchange")
	}
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT id,symbol,exchange,company_id AS "companyId",currency,status,isin,listed_at AS "listedAt" FROM market.securities WHERE exchange=$1 AND status<>'delisted' ORDER BY symbol ASC) result`, exchange)
}
