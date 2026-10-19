package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type StatisticsProvider interface {
	Statistics(context.Context, string, string) (json.RawMessage, error)
}

var statisticsSymbol = regexp.MustCompile(`^[A-Z0-9.-]{1,20}$`)

func (s *Server) statisticsReads(ctx context.Context, w http.ResponseWriter, r *http.Request, exchange string) bool {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/statistics/") {
		return false
	}
	symbol := strings.ToUpper(strings.TrimPrefix(r.URL.Path, "/api/v1/statistics/"))
	if !statisticsSymbol.MatchString(symbol) {
		failure(w, 400, "Invalid stock symbol")
		return true
	}
	if s.Statistics == nil {
		failure(w, 503, "Native market statistics are not configured.")
		return true
	}
	load := func(ctx context.Context) (json.RawMessage, error) {
		return s.Statistics.Statistics(ctx, exchange, symbol)
	}
	var raw json.RawMessage
	var err error
	if s.ReadCache != nil {
		raw, err = s.ReadCache.GetOrLoad(ctx, "statistics-v1:"+exchange+":"+symbol, time.Minute, load)
	} else {
		raw, err = load(ctx)
	}
	if err != nil || (len(raw) > 0 && !json.Valid(raw)) {
		failure(w, 503, "Market statistics could not load. Please retry.")
		return true
	}
	if len(raw) == 0 || string(raw) == "null" {
		failure(w, 404, "Unknown stock symbol")
		return true
	}
	respond(w, 200, map[string]any{"data": raw})
	return true
}
