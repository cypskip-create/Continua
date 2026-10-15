package httpapi

import (
	"context"
	"continua/backend/internal/engine"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

type CandleInputs interface {
	Candles(context.Context, string, string, time.Time, time.Time) ([]json.RawMessage, error)
}

func (s *Server) indicatorReads(ctx context.Context, w http.ResponseWriter, r *http.Request, exchange string) bool {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/indicators/") {
		return false
	}
	symbol := strings.TrimPrefix(r.URL.Path, "/api/v1/indicators/")
	if symbol == "" || strings.Contains(symbol, "/") {
		failure(w, 404, "Not found")
		return true
	}
	q := r.URL.Query()
	kind := q.Get("type")
	if len(q["type"]) != 1 || !map[string]bool{"SMA": true, "EMA": true, "RSI": true, "MACD": true}[kind] {
		failure(w, 400, "Invalid indicator type")
		return true
	}
	options := map[string]any{"type": kind}
	longest := 50
	for _, key := range []string{"period", "fast", "slow", "signal"} {
		if !q.Has(key) {
			continue
		}
		value, err := intQuery(q, key, 0, 1, 500)
		if err != nil {
			failure(w, 400, "Invalid indicator "+key)
			return true
		}
		options[key] = value
		if (key == "period" || key == "slow") && value > longest {
			longest = value
		}
	}
	now := time.Now().UTC()
	from, to := now.Add(-time.Duration(longest+30)*24*time.Hour), now
	for _, key := range []string{"from", "to"} {
		if !q.Has(key) {
			continue
		}
		if len(q[key]) != 1 {
			failure(w, 400, "Invalid indicator date")
			return true
		}
		value, err := parseTime(q.Get(key))
		if err != nil {
			failure(w, 400, key+" must be a valid ISO 8601 date/time")
			return true
		}
		if key == "from" {
			from = value
		} else {
			to = value
		}
	}
	store, ok := s.Store.(CandleInputs)
	if !ok || s.Engine == nil {
		failure(w, 503, "Native technical research is not configured.")
		return true
	}
	rows, err := store.Candles(ctx, exchange+":"+strings.ToUpper(symbol), "1d", from, to)
	if err != nil {
		failure(w, 500, "Internal server error")
		return true
	}
	if len(rows) == 0 {
		failure(w, 404, "No candle data available for "+symbol+" on "+exchange+" in that range")
		return true
	}
	raw, err := s.Engine.Calculate(ctx, engine.Request{Operation: "technical_results", Args: []any{strings.ToUpper(symbol), exchange, rows, []any{options}}})
	var result []json.RawMessage
	if err != nil || json.Unmarshal(raw, &result) != nil || len(result) != 1 || string(result[0]) == "null" {
		failure(w, 503, "Technical research could not load. Please retry.")
		return true
	}
	respond(w, 200, map[string]any{"data": result[0]})
	return true
}
