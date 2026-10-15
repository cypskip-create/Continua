package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/engine"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type ScreeningStore interface {
	Screen(context.Context, marketdata.Screen) ([]json.RawMessage, error)
}

func (s *Server) screening(ctx context.Context, w http.ResponseWriter, r *http.Request, exchange string) bool {
	if r.URL.Path != "/api/v1/screener" {
		return false
	}
	if r.Method != "GET" {
		failure(w, 405, "Method not allowed")
		return true
	}
	q := r.URL.Query()
	f := marketdata.Screen{Exchange: exchange, SortBy: "afriScore", Direction: "desc", Limit: 50, Numbers: map[string]float64{}}
	for k, v := range q {
		if len(v) != 1 {
			failure(w, 400, "Duplicate screener parameter: "+k)
			return true
		}
	}
	if q.Has("sector") {
		f.Sector = q.Get("sector")
		if f.Sector == "" || len(f.Sector) > 200 {
			failure(w, 400, "Invalid sector")
			return true
		}
	}
	if q.Has("sortBy") {
		f.SortBy = q.Get("sortBy")
	}
	if q.Has("sortDirection") {
		f.Direction = q.Get("sortDirection")
	}
	if !map[string]bool{"afriScore": true, "changePercent": true, "marketCap": true, "dividendYield": true, "pe": true}[f.SortBy] || (f.Direction != "asc" && f.Direction != "desc") {
		failure(w, 400, "Invalid screener sort")
		return true
	}
	var err error
	f.Limit, err = intQuery(q, "limit", 50, 1, 200)
	if err != nil {
		failure(w, 400, "Invalid screener limit")
		return true
	}
	for _, key := range []string{"minMarketCap", "maxPe", "minDividendYield", "minAfriScore"} {
		if !q.Has(key) {
			continue
		}
		v, err := strconv.ParseFloat(q.Get(key), 64)
		if err != nil || math.IsNaN(v) || math.IsInf(v, 0) || (key == "minMarketCap" && v < 0) || (key == "minAfriScore" && (v < 0 || v > 100)) {
			failure(w, 400, "Invalid screener filter: "+key)
			return true
		}
		f.Numbers[key] = v
	}
	store, ok := s.Store.(ScreeningStore)
	if !ok {
		failure(w, 503, "Screener storage unavailable")
		return true
	}
	rows, err := store.Screen(ctx, f)
	if err != nil {
		failure(w, 503, "Screener unavailable")
		return true
	}
	adminRows(w, rows, nil)
	return true
}

type TechnicalStore interface {
	CandleInputs
	CorporateActions(context.Context, string) ([]json.RawMessage, error)
}

func (s *Server) technicalResearch(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity) bool {
	volume := strings.HasPrefix(r.URL.Path, "/api/v1/volume-profile/")
	test := r.URL.Path == "/api/v1/backtest"
	if !volume && !test {
		return false
	}
	if err := auth.RequirePremium(id); err != nil {
		failure(w, auth.AccessStatus(err), err.Error())
		return true
	}
	store, ok := s.Store.(TechnicalStore)
	if !ok || s.Engine == nil {
		failure(w, 503, "Historical research unavailable")
		return true
	}
	now := time.Now().UTC()
	exchange, symbol := "NSE", ""
	from, to := now.Add(-90*24*time.Hour), now
	args := map[string]any{}
	start, end := from.Format(time.RFC3339Nano), to.Format(time.RFC3339Nano)
	if volume {
		if r.Method != "GET" {
			failure(w, 405, "Method not allowed")
			return true
		}
		symbol = strings.TrimPrefix(r.URL.Path, "/api/v1/volume-profile/")
		q := r.URL.Query()
		if q.Has("exchange") {
			exchange = q.Get("exchange")
		}
		for k, v := range q {
			if len(v) != 1 {
				failure(w, 400, "Duplicate research parameter: "+k)
				return true
			}
		}
		if q.Has("interval") && !map[string]bool{"1m": true, "5m": true, "15m": true, "1h": true, "1d": true, "1w": true, "1M": true, "1y": true}[q.Get("interval")] {
			failure(w, 400, "Invalid interval")
			return true
		}
		if q.Has("from") {
			start = q.Get("from")
		}
		if q.Has("to") {
			end = q.Get("to")
		}
	} else {
		if r.Method != "POST" {
			failure(w, 405, "Method not allowed")
			return true
		}
		raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 65536))
		if err != nil {
			failure(w, 413, "Research request too large")
			return true
		}
		var fields map[string]json.RawMessage
		if json.Unmarshal(raw, &fields) != nil || fields == nil {
			failure(w, 400, "Invalid research request")
			return true
		}
		for _, key := range []string{"symbol", "exchange", "strategy", "from", "to"} {
			if v, exists := fields[key]; exists {
				var text string
				if string(v) == "null" || json.Unmarshal(v, &text) != nil {
					failure(w, 400, "Invalid research "+key)
					return true
				}
				args[key] = text
			}
		}
		symbol, _ = args["symbol"].(string)
		if v, exists := args["exchange"]; exists {
			exchange = v.(string)
		}
		strategy, _ := args["strategy"].(string)
		if !map[string]bool{"sma_cross": true, "ema_cross": true, "rsi_reversion": true}[strategy] {
			failure(w, 400, "Invalid research strategy")
			return true
		}
		start, _ = args["from"].(string)
		if v, exists := args["to"]; exists {
			end = v.(string)
		}
		for _, key := range []string{"feeBps", "slippageBps", "initialCapital", "maxVolumeParticipation", "fastPeriod", "slowPeriod", "rsiPeriod", "oversold", "overbought"} {
			raw, exists := fields[key]
			if !exists {
				continue
			}
			var value float64
			if string(raw) == "null" || json.Unmarshal(raw, &value) != nil || math.IsNaN(value) || math.IsInf(value, 0) {
				failure(w, 400, "Invalid research "+key)
				return true
			}
			valid := true
			switch key {
			case "feeBps", "slippageBps":
				valid = value >= 0 && value <= 500
			case "initialCapital":
				valid = value > 0 && value <= 1e9
			case "maxVolumeParticipation":
				valid = value > 0 && value <= .2
			case "fastPeriod", "slowPeriod", "rsiPeriod":
				valid = value >= 1 && value <= 500 && value == math.Trunc(value)
			case "oversold", "overbought":
				valid = value >= 0 && value <= 100
			}
			if !valid {
				failure(w, 400, "Invalid research "+key)
				return true
			}
			args[key] = value
		}
	}
	symbol = strings.ToUpper(symbol)
	if exchange != "NSE" || symbol == "" || len(symbol) > 20 || strings.Contains(symbol, "/") {
		failure(w, 400, "Invalid research security")
		return true
	}
	var err error
	from, err = parseTime(start)
	if err != nil {
		failure(w, 400, "Invalid research start date")
		return true
	}
	to, err = parseTime(end)
	if err != nil || from.After(to) {
		failure(w, 400, "Invalid research date range")
		return true
	}
	bars, err := store.Candles(ctx, exchange+":"+symbol, "1d", from, to)
	if err != nil {
		failure(w, 503, "Historical observations unavailable")
		return true
	}
	if len(bars) == 0 || (test && len(bars) < 5) {
		failure(w, 404, "Insufficient recorded OHLCV for this research")
		return true
	}
	operation := "volume_profile"
	workerArgs := []any{bars, symbol, exchange, start, end}
	if test {
		actions, err := store.CorporateActions(ctx, exchange+":"+symbol)
		if err != nil {
			failure(w, 503, "Corporate-action basis unavailable")
			return true
		}
		args["symbol"], args["exchange"], args["from"], args["to"] = symbol, exchange, start, end
		operation = "backtest"
		workerArgs = []any{bars, args, actions}
	}
	raw, err := s.Engine.Calculate(ctx, engine.Request{Operation: operation, Args: workerArgs})
	if err != nil {
		failure(w, 503, "Historical research could not load")
		return true
	}
	if string(raw) == "null" {
		failure(w, 404, "Insufficient recorded OHLCV for this research")
		return true
	}
	var status struct {
		Blocked string `json:"blocked"`
	}
	_ = json.Unmarshal(raw, &status)
	if status.Blocked != "" {
		failure(w, 422, status.Blocked)
		return true
	}
	respond(w, 200, map[string]any{"data": raw})
	return true
}
