package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"
)

var closeHistorySymbol = regexp.MustCompile(`^[A-Z0-9.\-]{1,20}$`)

func (s *Server) closeHistory(ctx context.Context, w http.ResponseWriter, r *http.Request) bool {
	const prefix = "/api/v1/price-history/"
	if !strings.HasPrefix(r.URL.Path, prefix) {
		return false
	}
	if r.Method != "GET" {
		failure(w, 405, "Method not allowed")
		return true
	}
	symbol := strings.ToUpper(strings.TrimPrefix(r.URL.Path, prefix))
	if !closeHistorySymbol.MatchString(symbol) {
		failure(w, 400, "Invalid stock symbol")
		return true
	}
	now := time.Now().UTC()
	from := now.AddDate(-10, 0, 0)
	to := now
	for key, values := range r.URL.Query() {
		if len(values) != 1 || (key != "from" && key != "to" && key != "exchange") {
			failure(w, 400, "Invalid history query")
			return true
		}
		if key == "exchange" {
			if values[0] != "NSE" {
				failure(w, 400, "Unsupported exchange")
				return true
			}
			continue
		}
		value, err := time.Parse("2006-01-02", values[0])
		if err != nil {
			failure(w, 400, "Use YYYY-MM-DD history dates")
			return true
		}
		if key == "from" {
			from = value
		} else {
			to = value
		}
	}
	if from.After(to) || to.After(now) || to.Sub(from) > 36525*24*time.Hour {
		failure(w, 400, "Invalid history date range")
		return true
	}
	store, ok := s.Store.(interface {
		SecurityID(context.Context, string, string) (*string, error)
		DailyCloseHistory(context.Context, string, time.Time, time.Time) ([]json.RawMessage, error)
	})
	if !ok {
		failure(w, 503, "Daily price history unavailable")
		return true
	}
	id, err := store.SecurityID(ctx, "NSE", symbol)
	if err != nil {
		failure(w, 503, "Daily price history could not load")
		return true
	}
	if id == nil {
		failure(w, 404, "Unknown stock symbol")
		return true
	}
	rows, err := store.DailyCloseHistory(ctx, *id, from, to)
	if err != nil || len(rows) > 10000 {
		failure(w, 503, "Daily price history could not load")
		return true
	}
	if rows == nil {
		rows = []json.RawMessage{}
	}
	respond(w, 200, map[string]any{"data": rows, "basis": "daily_close_only", "ohlcAvailable": false, "missingVolumeIsZero": false})
	return true
}
