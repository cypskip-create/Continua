package marketdata

import (
	"context"
	"errors"
	"math"
	"strings"
	"time"
)

type IndexInput struct {
	ID            string   `json:"id"`
	Code          string   `json:"code"`
	Name          string   `json:"name"`
	Exchange      string   `json:"exchange"`
	Currency      string   `json:"currency"`
	Timestamp     string   `json:"timestamp"`
	Source        string   `json:"source"`
	Value         *float64 `json:"value"`
	PreviousClose *float64 `json:"previousClose"`
	Change        *float64 `json:"change"`
	ChangePercent *float64 `json:"changePercent"`
}

func (v IndexInput) Validate(now time.Time) error {
	if v.Exchange != "NSE" || v.Currency != "KES" || v.Code == "" || len(v.Code) > 30 || v.ID != "NSE:index:"+v.Code || v.Name == "" || len(v.Name) > 200 || strings.TrimSpace(v.Code) != v.Code || !map[string]bool{"eod": true, "live": true, "delayed": true}[v.Source] {
		return errors.New("invalid index identity")
	}
	at, err := time.Parse(time.RFC3339Nano, v.Timestamp)
	if err != nil || at.After(now) {
		return errors.New("past index timestamp required")
	}
	for _, value := range []*float64{v.Value, v.PreviousClose, v.Change, v.ChangePercent} {
		if value == nil || math.IsNaN(*value) || math.IsInf(*value, 0) {
			return errors.New("literal index observations required")
		}
	}
	if *v.Value < 0 || *v.PreviousClose < 0 {
		return errors.New("negative index level")
	}
	return nil
}

func (s *Store) UpsertIndicesBatch(ctx context.Context, input []IndexInput, now time.Time) error {
	if len(input) > 100 {
		return errors.New("index batch limit")
	}
	if len(input) == 0 {
		return nil
	}
	seen := map[string]bool{}
	for _, v := range input {
		if v.Exchange != "NSE" || v.Currency != "KES" || v.Code == "" || len(v.Code) > 30 || v.ID != "NSE:index:"+v.Code || v.Name == "" || len(v.Name) > 200 || !map[string]bool{"eod": true, "live": true, "delayed": true}[v.Source] || strings.TrimSpace(v.Code) != v.Code {
			return errors.New("invalid index identity")
		}
		at, e := time.Parse(time.RFC3339Nano, v.Timestamp)
		if e != nil || at.After(now) {
			return errors.New("past index timestamp required")
		}
		for _, n := range []*float64{v.Value, v.PreviousClose, v.Change, v.ChangePercent} {
			if n == nil || math.IsNaN(*n) || math.IsInf(*n, 0) {
				return errors.New("literal index observations required")
			}
		}
		if *v.Value < 0 || *v.PreviousClose < 0 {
			return errors.New("negative index level")
		}
		if seen[v.Code] {
			return errors.New("duplicate index key")
		}
		seen[v.Code] = true
	}
	tx, e := s.DB.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	for _, v := range input {
		_, e = tx.ExecContext(ctx, `INSERT INTO market.indices (id,code,name,exchange,value,previous_close,change,change_percent,currency,event_timestamp,source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(exchange,code) DO UPDATE SET value=EXCLUDED.value,previous_close=EXCLUDED.previous_close,change=EXCLUDED.change,change_percent=EXCLUDED.change_percent,event_timestamp=EXCLUDED.event_timestamp,source=EXCLUDED.source,updated_at=now() WHERE (EXCLUDED.event_timestamp>=market.indices.event_timestamp OR market.indices.source<>'eod') AND (market.indices.value,market.indices.previous_close,market.indices.change,market.indices.change_percent,market.indices.event_timestamp,market.indices.source) IS DISTINCT FROM (EXCLUDED.value,EXCLUDED.previous_close,EXCLUDED.change,EXCLUDED.change_percent,EXCLUDED.event_timestamp,EXCLUDED.source)`, v.ID, v.Code, v.Name, v.Exchange, v.Value, v.PreviousClose, v.Change, v.ChangePercent, v.Currency, v.Timestamp, v.Source)
		if e != nil {
			return e
		}
	}
	return tx.Commit()
}
