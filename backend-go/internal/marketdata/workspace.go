package marketdata

import (
	"context"
	"encoding/json"
	"errors"
)

var ErrMonitorCapacity = errors.New("Maximum 50 Engine monitoring rules per account.")

type MonitorRule struct {
	Exchange  string   `json:"exchange"`
	Symbol    string   `json:"symbol"`
	Kind      string   `json:"kind"`
	Threshold *float64 `json:"threshold"`
	Enabled   bool     `json:"enabled"`
}

func (s *Store) MonitoringRules(ctx context.Context, owner string) ([]json.RawMessage, error) {
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT id,exchange,symbol,kind,threshold,enabled,last_state FROM market.engine_monitor_rules WHERE user_id=$1 ORDER BY created_at DESC) result`, owner)
}

func (s *Store) SaveMonitoringRule(ctx context.Context, owner string, rule MonitorRule) (json.RawMessage, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	// Enforce the cap under an account lock, including concurrent device requests.
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "engine-monitor-rules:"+owner); err != nil {
		return nil, err
	}
	var count int
	var exists bool
	err = tx.QueryRowContext(ctx, `SELECT count(*)::int,COALESCE(bool_or(exchange=$2 AND symbol=$3 AND kind=$4),false) FROM market.engine_monitor_rules WHERE user_id=$1`, owner, rule.Exchange, rule.Symbol, rule.Kind).Scan(&count, &exists)
	if err != nil {
		return nil, err
	}
	if count >= 50 && !exists {
		return nil, ErrMonitorCapacity
	}
	var raw []byte
	err = tx.QueryRowContext(ctx, `WITH saved AS (INSERT INTO market.engine_monitor_rules(user_id,exchange,symbol,kind,threshold,enabled) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,exchange,symbol,kind) DO UPDATE SET threshold=EXCLUDED.threshold,enabled=EXCLUDED.enabled,last_state=NULL RETURNING id,exchange,symbol,kind,threshold,enabled) SELECT row_to_json(saved) FROM saved`, owner, rule.Exchange, rule.Symbol, rule.Kind, rule.Threshold, rule.Enabled).Scan(&raw)
	if err != nil {
		return nil, err
	}
	if !json.Valid(raw) {
		return nil, errors.New("invalid monitor response")
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return json.RawMessage(raw), nil
}

func (s *Store) DeleteMonitoringRule(ctx context.Context, owner, id string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM market.engine_monitor_rules WHERE id=$1 AND user_id=$2`, id, owner)
	return err
}
func (s *Store) MonitoringActivity(ctx context.Context, owner string) ([]json.RawMessage, error) {
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT id,title,message,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at FROM public.notifications WHERE user_id=$1 AND type='engine' ORDER BY created_at DESC LIMIT 20) result`, owner)
}
func (s *Store) AddCashFlow(ctx context.Context, owner, exchange, date string, amount float64, note string) (json.RawMessage, error) {
	var raw []byte
	err := s.DB.QueryRowContext(ctx, `WITH saved AS (INSERT INTO public.engine_cash_flows(user_id,exchange,session_date,amount,note) VALUES($1,$2,$3,$4,$5) RETURNING id) SELECT row_to_json(saved) FROM saved`, owner, exchange, date, amount, note).Scan(&raw)
	if err != nil {
		return nil, err
	}
	if !json.Valid(raw) {
		return nil, errors.New("invalid cash flow response")
	}
	return json.RawMessage(raw), nil
}
func (s *Store) DeleteCashFlow(ctx context.Context, owner, id string) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM public.engine_cash_flows WHERE id=$1 AND user_id=$2`, id, owner)
	return err
}
