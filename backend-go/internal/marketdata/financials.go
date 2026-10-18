package marketdata

import (
	"context"
	"encoding/json"
	"errors"
)

func (s *Store) LatestFinancials(ctx context.Context, id, periodType string) (json.RawMessage, error) {
	rows, err := s.FinancialHistory(ctx, id, periodType, 1)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[len(rows)-1], nil
}
func (s *Store) FinancialHistory(ctx context.Context, id, periodType string, limit int) ([]json.RawMessage, error) {
	if (periodType != "annual" && periodType != "quarterly") || limit < 1 || limit > 100 {
		return nil, errors.New("invalid financial history request")
	}
	return s.JSONRows(ctx, `SELECT payload FROM market.canonical_financial_history($1,$2,$3,$4) payload`, id, periodType, limit, s.AllowUnreviewed)
}
