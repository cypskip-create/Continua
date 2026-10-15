package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

type ValuationProvider interface {
	Valuation(context.Context, string, string) (json.RawMessage, error)
	ValuationHistory(context.Context, string, string, string, int) (json.RawMessage, error)
}

func (s *Server) valuationReads(ctx context.Context, w http.ResponseWriter, r *http.Request, exchange string) bool {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/valuation/") {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/v1/valuation/"), "/")
	if parts[0] == "" || len(parts) > 2 || (len(parts) == 2 && parts[1] != "history") {
		failure(w, 404, "Not found")
		return true
	}
	if s.Valuations == nil {
		failure(w, 503, "Native valuation research is not configured.")
		return true
	}
	symbol := strings.ToUpper(parts[0])
	var raw json.RawMessage
	var err error
	if len(parts) == 2 {
		q := r.URL.Query()
		ratio := "pe"
		if q.Has("ratio") {
			ratio = q.Get("ratio")
		}
		if len(q["ratio"]) > 1 || !map[string]bool{"pe": true, "pb": true, "ps": true}[ratio] {
			failure(w, 400, "Invalid valuation ratio")
			return true
		}
		years, e := intQuery(q, "years", 5, 1, 10)
		if e != nil {
			failure(w, 400, "Invalid valuation years")
			return true
		}
		raw, err = s.Valuations.ValuationHistory(ctx, exchange, symbol, ratio, years)
	} else {
		raw, err = s.Valuations.Valuation(ctx, exchange, symbol)
	}
	if err != nil {
		failure(w, 503, "Valuation research could not load. Please retry.")
		return true
	}
	if len(raw) == 0 || string(raw) == "null" {
		failure(w, 404, "No quote or company data available for "+parts[0]+" on "+exchange)
		return true
	}
	if !json.Valid(raw) {
		failure(w, 503, "Valuation research could not load. Please retry.")
		return true
	}
	respond(w, 200, map[string]any{"data": raw})
	return true
}
