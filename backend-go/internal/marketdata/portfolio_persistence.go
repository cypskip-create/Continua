package marketdata

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
)

func (s *Store) SavePortfolioSnapshot(ctx context.Context, owner, exchange, currency, date string, value float64, positions []json.RawMessage) error {
	if owner == "" || exchange != "NSE" || currency != "KES" {
		return errors.New("invalid owned portfolio snapshot")
	}
	raw, e := json.Marshal(positions)
	if e != nil {
		return e
	}
	_, e = s.DB.ExecContext(ctx, `INSERT INTO market.engine_portfolio_snapshots(user_id,exchange,currency,session_date,total_value,holdings) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(user_id,exchange,session_date) DO UPDATE SET total_value=EXCLUDED.total_value,holdings=EXCLUDED.holdings,captured_at=now() WHERE (engine_portfolio_snapshots.total_value,engine_portfolio_snapshots.holdings) IS DISTINCT FROM (EXCLUDED.total_value,EXCLUDED.holdings)`, owner, exchange, currency, date, value, string(raw))
	return e
}

// One read-only repeatable snapshot keeps dated flows and valuations consistent.
func (s *Store) PortfolioPersistence(ctx context.Context, owner, exchange string) (map[string][]json.RawMessage, error) {
	tx, e := s.DB.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if e != nil {
		return nil, e
	}
	defer tx.Rollback()
	out := map[string][]json.RawMessage{}
	queries := []struct{ key, sql string }{
		{"snapshots", `SELECT row_to_json(result) FROM (SELECT s.session_date::text AS date,s.total_value::float8 AS value,COALESCE((SELECT sum(amount) FROM public.engine_cash_flows f WHERE f.user_id=s.user_id AND f.exchange=s.exchange AND f.session_date>s.session_date-interval '1 day' AND f.session_date<=s.session_date),0)::float8 AS flow FROM market.engine_portfolio_snapshots s WHERE user_id=$1 AND exchange=$2 ORDER BY session_date) result`},
		{"flows", `SELECT row_to_json(result) FROM (SELECT id,session_date::text AS date,amount::float8 AS amount,note FROM public.engine_cash_flows WHERE user_id=$1 AND exchange=$2 ORDER BY session_date DESC LIMIT 100) result`},
		{"periodFlows", `SELECT row_to_json(result) FROM (SELECT session_date::text AS date,sum(amount)::float8 AS amount FROM public.engine_cash_flows WHERE user_id=$1 AND exchange=$2 GROUP BY session_date ORDER BY session_date) result`},
	}
	total := 0
	for _, q := range queries {
		rows, e := tx.QueryContext(ctx, q.sql, owner, exchange)
		if e != nil {
			return nil, e
		}
		items := []json.RawMessage{}
		for rows.Next() {
			var raw json.RawMessage
			if e = rows.Scan(&raw); e != nil {
				rows.Close()
				return nil, e
			}
			total += len(raw)
			if total > 2*1024*1024 || !json.Valid(raw) {
				rows.Close()
				return nil, ErrReadBudget
			}
			items = append(items, raw)
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return nil, e
		}
		out[q.key] = items
	}
	if e = tx.Commit(); e != nil {
		return nil, e
	}
	return out, nil
}
