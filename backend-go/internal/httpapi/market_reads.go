package httpapi

import (
	"context"
	"continua/backend/internal/cache"
	"continua/backend/internal/engine"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type HistoricalStore interface {
	SecurityID(context.Context, string, string) (*string, error)
	Candles(context.Context, string, string, time.Time, time.Time) ([]json.RawMessage, error)
	PriceAt(context.Context, string, time.Time) (*float64, error)
	Sparklines(context.Context, string, []string, int) (map[string][]float64, error)
	Indices(context.Context, string) ([]json.RawMessage, error)
	LatestFinancials(context.Context, string, string) (json.RawMessage, error)
	FinancialHistory(context.Context, string, string, int) ([]json.RawMessage, error)
}
type Calculator interface {
	Calculate(context.Context, engine.Request) (json.RawMessage, error)
}

func parseTime(value string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05", "2006-01-02"} {
		if parsed, e := time.Parse(layout, value); e == nil {
			return parsed.UTC(), nil
		}
	}
	return time.Time{}, errors.New("invalid date")
}
func intQuery(q url.Values, key string, fallback, min, max int) (int, error) {
	if !q.Has(key) {
		return fallback, nil
	}
	if len(q[key]) != 1 {
		return 0, errors.New("invalid query")
	}
	value, err := strconv.ParseFloat(strings.TrimSpace(q.Get(key)), 64)
	if err != nil || value < float64(min) || value > float64(max) || value != float64(int(value)) {
		return 0, errors.New("invalid query")
	}
	return int(value), nil
}
func splitSymbols(param string) ([]string, error) {
	if param == "" || len(param) > 16384 {
		return nil, errors.New("invalid symbols")
	}
	symbols := []string{}
	for _, symbol := range strings.Split(param, ",") {
		if symbol = strings.ToUpper(strings.TrimSpace(symbol)); symbol != "" {
			symbols = append(symbols, symbol)
		}
	}
	if len(symbols) > 1000 {
		return nil, errors.New("invalid symbols")
	}
	return symbols, nil
}
func (s *Server) marketReads(ctx context.Context, w http.ResponseWriter, r *http.Request, exchange string) bool {
	path := r.URL.Path
	if path != "/api/v1/indices" && !strings.HasPrefix(path, "/api/v1/historical/") && !strings.HasPrefix(path, "/api/v1/financials/") {
		return false
	}
	store, ok := s.Store.(HistoricalStore)
	if !ok {
		failure(w, 501, "Native historical/financial storage is not configured.")
		return true
	}
	q := r.URL.Query()
	for _, key := range []string{"exchange", "symbols", "points", "interval", "from", "to", "periodType", "limit"} {
		if len(q[key]) > 1 {
			failure(w, 400, "Invalid query")
			return true
		}
	}
	send := func(value any, err error) {
		if err != nil {
			if errors.Is(err, cache.ErrBusy) {
				failure(w, 503, "Research reads are busy. Please retry.")
			} else {
				failure(w, 500, "Internal server error")
			}
			return
		}
		respond(w, 200, map[string]any{"data": value})
	}
	load := func(key string, ttl time.Duration, fn func(context.Context) (json.RawMessage, error)) (json.RawMessage, error) {
		if s.ReadCache == nil {
			return fn(ctx)
		}
		return s.ReadCache.GetOrLoad(ctx, key, ttl, fn)
	}
	if path == "/api/v1/indices" {
		if s.RequestIndices != nil {
			s.RequestIndices()
		}
		raw, err := load("indices:"+exchange, 30*time.Second, func(ctx context.Context) (json.RawMessage, error) {
			rows, e := store.Indices(ctx, exchange)
			if e != nil {
				return nil, e
			}
			if rows == nil {
				rows = []json.RawMessage{}
			}
			return json.Marshal(rows)
		})
		send(raw, err)
		return true
	}
	if path == "/api/v1/historical/sparklines" {
		symbols, err := splitSymbols(q.Get("symbols"))
		points, e := intQuery(q, "points", 20, 2, 90)
		if err != nil || e != nil {
			failure(w, 400, "Invalid symbols or points")
			return true
		}
		data, err := store.Sparklines(ctx, exchange, symbols, points)
		if data == nil && err == nil {
			data = map[string][]float64{}
		}
		send(data, err)
		return true
	}
	segments := strings.Split(strings.TrimPrefix(path, "/api/v1/"), "/")
	if len(segments) < 2 || len(segments) > 3 || segments[1] == "" {
		failure(w, 404, "Not found")
		return true
	}
	original, symbol := segments[1], strings.ToUpper(segments[1])
	family := segments[0]
	variant := ""
	if len(segments) == 3 {
		variant = segments[2]
	}
	if family == "financials" {
		if variant != "" && variant != "history" {
			return false
		}
		periodType := q.Get("periodType")
		if !q.Has("periodType") {
			periodType = "annual"
		}
		if periodType != "annual" && periodType != "quarterly" {
			failure(w, 400, "Invalid periodType")
			return true
		}
		limit, err := intQuery(q, "limit", 5, 1, 50)
		if err != nil {
			failure(w, 400, "Invalid limit")
			return true
		}
		id, err := store.SecurityID(ctx, exchange, symbol)
		if err != nil {
			send(nil, err)
			return true
		}
		if id == nil {
			failure(w, 404, "Unknown symbol "+original)
			return true
		}
		key := "financial-read:canonical-v1:" + exchange + ":" + symbol + ":" + periodType + ":" + variant + ":" + strconv.Itoa(limit)
		raw, err := load(key, 60*time.Second, func(ctx context.Context) (json.RawMessage, error) {
			if variant == "history" {
				rows, e := store.FinancialHistory(ctx, *id, periodType, limit)
				if e != nil {
					return nil, e
				}
				if rows == nil {
					rows = []json.RawMessage{}
				}
				return json.Marshal(rows)
			}
			return store.LatestFinancials(ctx, *id, periodType)
		})
		if err != nil {
			send(nil, err)
			return true
		}
		if len(raw) == 0 || string(raw) == "null" {
			failure(w, 404, "No financials available yet")
			return true
		}
		send(raw, nil)
		return true
	}
	if family != "historical" || (variant != "" && variant != "performance") {
		failure(w, 404, "Not found")
		return true
	}
	now := time.Now().UTC()
	from, to := now.Add(-90*24*time.Hour), now
	var err error
	if q.Has("from") {
		from, err = parseTime(q.Get("from"))
		if err != nil {
			failure(w, 400, "from must be a valid ISO 8601 date/time")
			return true
		}
	} else if variant == "performance" {
		failure(w, 400, "from is required")
		return true
	}
	if q.Has("to") {
		to, err = parseTime(q.Get("to"))
		if err != nil {
			failure(w, 400, "to must be a valid ISO 8601 date/time")
			return true
		}
	}
	interval := q.Get("interval")
	if !q.Has("interval") {
		interval = "1d"
	}
	if !map[string]bool{"1m": true, "5m": true, "15m": true, "1h": true, "1d": true, "1w": true, "1M": true, "1y": true}[interval] {
		failure(w, 400, "Invalid interval")
		return true
	}
	id, err := store.SecurityID(ctx, exchange, symbol)
	if err != nil {
		send(nil, err)
		return true
	}
	if variant == "performance" {
		if id == nil {
			failure(w, 404, "No historical data available for that range")
			return true
		}
		first, e := store.PriceAt(ctx, *id, from)
		if e != nil {
			send(nil, e)
			return true
		}
		last, e := store.PriceAt(ctx, *id, to)
		if e != nil {
			send(nil, e)
			return true
		}
		if first == nil || last == nil || *first == 0 {
			failure(w, 404, "No historical data available for that range")
			return true
		}
		send(map[string]any{"startPrice": *first, "endPrice": *last, "changePercent": (*last - *first) / (*first) * 100}, nil)
		return true
	}
	if id == nil {
		send([]json.RawMessage{}, nil)
		return true
	}
	key := "candles:" + exchange + ":" + symbol + ":" + interval + ":" + from.Format(time.RFC3339Nano) + ":" + to.Format(time.RFC3339Nano)
	raw, err := load(key, 30*time.Second, func(ctx context.Context) (json.RawMessage, error) {
		sourceInterval := interval
		if interval == "1w" || interval == "1M" || interval == "1y" {
			sourceInterval = "1d"
		}
		rows, e := store.Candles(ctx, *id, sourceInterval, from, to)
		if e != nil {
			return nil, e
		}
		if rows == nil {
			rows = []json.RawMessage{}
		}
		if sourceInterval == interval {
			return json.Marshal(rows)
		}
		if s.Engine == nil {
			return nil, errors.New("native calculation worker missing")
		}
		raw, e := s.Engine.Calculate(ctx, engine.Request{Operation: "aggregate_candles", Args: []any{rows, interval}})
		if e != nil {
			return nil, e
		}
		var bars []json.RawMessage
		if e = json.Unmarshal(raw, &bars); e != nil {
			return nil, e
		}
		filtered := []json.RawMessage{}
		for _, bar := range bars {
			var date struct {
				Timestamp string `json:"timestamp"`
			}
			if e = json.Unmarshal(bar, &date); e != nil {
				return nil, e
			}
			at, e := parseTime(date.Timestamp)
			if e != nil {
				return nil, e
			}
			if !at.Before(from) {
				filtered = append(filtered, bar)
			}
		}
		return json.Marshal(filtered)
	})
	send(raw, err)
	return true
}
