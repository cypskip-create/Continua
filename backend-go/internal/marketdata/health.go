package marketdata

import (
	"context"
	"encoding/json"
)

func (s *Store) QuoteFreshness(ctx context.Context) (int64, int64, error) {
	var total, stale int64
	e := s.DB.QueryRowContext(ctx, `SELECT count(*),count(*) FILTER(WHERE event_timestamp<now()-interval '900 seconds' OR event_timestamp>now()) FROM market.live_quotes WHERE status='active'`).Scan(&total, &stale)
	return total, stale, e
}
func (s *Store) ValidationOutcomes(ctx context.Context) ([]json.RawMessage, error) {
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT outcome,count(*)::int AS count,to_char(max(validated_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS latest FROM (SELECT DISTINCT ON(extraction_id) outcome,validated_at FROM market.document_validations ORDER BY extraction_id,validated_at DESC,validator_version DESC) latest GROUP BY outcome ORDER BY outcome) result`)
}
