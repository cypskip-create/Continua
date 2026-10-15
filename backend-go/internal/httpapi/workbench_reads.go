package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

type WorkbenchReads interface {
	FinancialVersions(context.Context, string) ([]json.RawMessage, error)
	LabHistory(context.Context, string, string, string) ([]json.RawMessage, error)
}
type MonitorRunner interface {
	Check(context.Context, string, string, string) error
}

func (s *Server) workbenchReads(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity) bool {
	path := r.URL.Path
	history := path == "/api/v1/engine/labs/history-inputs"
	versions := path == "/api/v1/engine/financial-versions"
	check := path == "/api/v1/engine/monitoring/check"
	if !history && !versions && !check {
		return false
	}
	var err error
	if versions {
		err = auth.RequirePremium(id)
	} else {
		err = auth.RequirePlus(id)
	}
	if err != nil {
		failure(w, auth.AccessStatus(err), err.Error())
		return true
	}
	if check {
		if r.Method != "POST" {
			failure(w, 405, "Method not allowed")
			return true
		}
		if s.Monitor == nil {
			failure(w, 503, "Native monitor unavailable")
			return true
		}
		body, err := workspaceBody(r)
		if err != nil {
			failure(w, 400, "Invalid monitor request")
			return true
		}
		symbol, err := workspaceString(body, "symbol", nil)
		nse := "NSE"
		exchange, e := workspaceString(body, "exchange", &nse)
		symbol = strings.ToUpper(strings.TrimSpace(symbol))
		if err != nil || e != nil || !companySymbol.MatchString(symbol) || exchange != "NSE" {
			failure(w, 400, "Invalid monitor security")
			return true
		}
		if err := s.Monitor.Check(ctx, id.UserID, symbol, exchange); err != nil {
			failure(w, 503, "Monitoring inputs unavailable. Previous state retained.")
			return true
		}
		store, ok := s.Store.(WorkspaceStore)
		if !ok {
			failure(w, 503, "Monitoring storage unavailable")
			return true
		}
		rows, err := store.MonitoringRules(ctx, id.UserID)
		if err != nil {
			failure(w, 503, "Monitoring storage unavailable")
			return true
		}
		if rows == nil {
			rows = []json.RawMessage{}
		}
		respond(w, 200, map[string]any{"data": rows})
		return true
	}
	if r.Method != "GET" {
		failure(w, 405, "Method not allowed")
		return true
	}
	q := r.URL.Query()
	symbol := q.Get("symbol")
	symbol = strings.ToUpper(strings.TrimSpace(symbol))
	if len(q["symbol"]) != 1 || !companySymbol.MatchString(symbol) {
		failure(w, 400, "Invalid stock symbol")
		return true
	}
	store, ok := s.Store.(WorkbenchReads)
	if !ok {
		failure(w, 503, "Native research evidence unavailable")
		return true
	}
	if versions {
		rows, err := store.FinancialVersions(ctx, "NSE:"+symbol)
		if err != nil {
			failure(w, 503, "Financial version audit unavailable")
			return true
		}
		if rows == nil {
			rows = []json.RawMessage{}
		}
		respond(w, 200, map[string]any{"data": map[string]any{"versions": rows, "methodology": "Canonical changes recorded from deployment onward. Recorded time is not the original filing/publication date. This audit preserves prior values but does not identify or approve issuer restatements; conflicting documents still require review."}})
		return true
	}
	start, end := q.Get("start"), q.Get("end")
	from, e1 := time.Parse("2006-01-02", start)
	to, e2 := time.Parse("2006-01-02", end)
	if len(q["start"]) != 1 || len(q["end"]) != 1 || e1 != nil || e2 != nil || !from.Before(to) || end > time.Now().UTC().Format("2006-01-02") || to.Sub(from) > 6*366*24*time.Hour {
		failure(w, 400, "Use an ordered past window of at most six years")
		return true
	}
	rows, err := store.LabHistory(ctx, "NSE:"+symbol, start, end)
	if err != nil {
		failure(w, 503, "Source-backed history unavailable")
		return true
	}
	if len(rows) > 1500 {
		failure(w, 400, "Reduce the window to at most 1500 observed sessions.")
		return true
	}
	if len(rows) < 2 {
		failure(w, 422, "Fewer than two source-backed price observations are stored for this window. Missing sessions are not invented.")
		return true
	}
	points := []map[string]any{}
	sources := []string{}
	seen := map[string]bool{}
	for _, raw := range rows {
		var row struct {
			Date  string  `json:"date"`
			Close float64 `json:"close"`
			URL   string  `json:"sourceUrl"`
		}
		if json.Unmarshal(raw, &row) != nil {
			failure(w, 503, "Invalid stored history")
			return true
		}
		points = append(points, map[string]any{"date": row.Date, "close": row.Close})
		if !seen[row.URL] {
			sources = append(sources, row.URL)
			seen[row.URL] = true
		}
	}
	respond(w, 200, map[string]any{"data": map[string]any{"symbol": symbol, "points": points, "sourceUrls": sources, "basis": "Stored source-linked raw price closes; corporate-action completeness and benchmark compatibility require separate verification."}})
	return true
}
