package marketdata

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"time"
)

// Native SQL readers retain production provenance gates. The candidate defaults
// to reviewed/sourced data; unreviewed fixtures require explicit opt-in.
var ErrReadBudget = errors.New("native read response budget exceeded")

func (s *Store) JSONRows(ctx context.Context, query string, args ...any) ([]json.RawMessage, error) {
	return s.JSONRowsBounded(ctx, 8*1024*1024, query, args...)
}
func (s *Store) JSONRowsBounded(ctx context.Context, maxBytes int, query string, args ...any) ([]json.RawMessage, error) {
	if maxBytes < 1 || maxBytes > 32*1024*1024 {
		return nil, errors.New("invalid native read budget")
	}
	rows, err := s.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []json.RawMessage{}
	total := 0
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		if !json.Valid(raw) {
			return nil, errors.New("invalid database JSON")
		}
		total += len(raw)
		if total > maxBytes {
			return nil, ErrReadBudget
		}
		out = append(out, json.RawMessage(raw))
	}
	return out, rows.Err()
}
func (s *Store) SecurityID(ctx context.Context, exchange, symbol string) (*string, error) {
	var id string
	err := s.DB.QueryRowContext(ctx, `SELECT id FROM market.securities WHERE exchange=$1 AND status<>'delisted' AND symbol=$2`, exchange, symbol).Scan(&id)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &id, nil
}
func (s *Store) Candles(ctx context.Context, id, interval string, from, to time.Time) ([]json.RawMessage, error) {
	rows, err := s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT security_id AS "securityId",interval,to_char(bar_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "timestamp",open,high,low,close,volume,source_url AS "sourceUrl" FROM market.candles WHERE security_id=$1 AND interval=$2 AND bar_time BETWEEN $3 AND $4 AND ($5 OR source_url IS NOT NULL) ORDER BY bar_time ASC) result`, id, interval, from, to, s.AllowUnreviewed)
	if err != nil || interval != "1d" {
		return rows, err
	}
	return s.publisherDaily(ctx, id, from, to, rows)
}
func (s *Store) PriceAt(ctx context.Context, id string, at time.Time) (*float64, error) {
	var close sql.NullFloat64
	err := s.DB.QueryRowContext(ctx, `SELECT close FROM market.candles WHERE security_id=$1 AND interval='1d' AND bar_time<=$2 AND ($3 OR source_url IS NOT NULL) ORDER BY bar_time DESC LIMIT 1`, id, at, s.AllowUnreviewed).Scan(&close)
	if err == sql.ErrNoRows || (err == nil && !close.Valid) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if math.IsNaN(close.Float64) || math.IsInf(close.Float64, 0) {
		return nil, errors.New("invalid close")
	}
	return &close.Float64, nil
}
func (s *Store) Sparklines(ctx context.Context, exchange string, symbols []string, points int) (map[string][]float64, error) {
	out := map[string][]float64{}
	if len(symbols) == 0 {
		return out, nil
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT symbol,close FROM (SELECT s.symbol,c.bar_time,c.close,row_number() OVER(PARTITION BY c.security_id ORDER BY c.bar_time DESC) AS rn FROM market.candles c JOIN market.securities s ON s.id=c.security_id WHERE s.exchange=$1 AND s.status<>'delisted' AND s.symbol=ANY($2) AND c.interval='1d' AND ($4 OR c.source_url IS NOT NULL)) ranked WHERE rn<=$3 ORDER BY symbol,bar_time ASC`, exchange, symbols, points, s.AllowUnreviewed)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var symbol string
		var close float64
		if err := rows.Scan(&symbol, &close); err != nil {
			return nil, err
		}
		if math.IsNaN(close) || math.IsInf(close, 0) {
			return nil, errors.New("invalid close")
		}
		out[symbol] = append(out[symbol], close)
	}
	return out, rows.Err()
}
func (s *Store) Indices(ctx context.Context, exchange string) ([]json.RawMessage, error) {
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT id,code,name,exchange,value,previous_close AS "previousClose",change,change_percent AS "changePercent",currency,to_char(event_timestamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "timestamp",source FROM market.indices WHERE exchange=$1 AND (exchange<>'NSE' OR source='eod') ORDER BY code) result`, exchange)
}
func (s *Store) HighLow(ctx context.Context, id string, from, to time.Time) (json.RawMessage, error) {
	var high, low sql.NullFloat64
	err := s.DB.QueryRowContext(ctx, `SELECT MAX(high),MIN(low) FROM market.candles WHERE security_id=$1 AND interval='1d' AND bar_time BETWEEN $2 AND $3 AND ($4 OR source_url IS NOT NULL)`, id, from, to, s.AllowUnreviewed).Scan(&high, &low)
	if err != nil {
		return nil, err
	}
	if !high.Valid {
		return json.RawMessage(`null`), nil
	}
	var lowValue any
	if low.Valid {
		lowValue = low.Float64
	}
	return json.Marshal(map[string]any{"high": high.Float64, "low": lowValue})
}
func (s *Store) AverageVolume(ctx context.Context, id string, from, to time.Time) (*float64, error) {
	var value sql.NullFloat64
	err := s.DB.QueryRowContext(ctx, `SELECT AVG(volume) FROM market.candles WHERE security_id=$1 AND interval='1d' AND bar_time BETWEEN $2 AND $3 AND ($4 OR source_url IS NOT NULL)`, id, from, to, s.AllowUnreviewed).Scan(&value)
	if err != nil {
		return nil, err
	}
	if !value.Valid {
		return nil, nil
	}
	return &value.Float64, nil
}
