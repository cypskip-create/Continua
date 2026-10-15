package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

func (s *Server) marketExtras(ctx context.Context, w http.ResponseWriter, r *http.Request, exchange string) bool {
	if r.URL.Path == "/api/v1/movers" {
		limit, err := intQuery(r.URL.Query(), "limit", 10, 1, 50)
		if err != nil {
			failure(w, 400, "Invalid movers limit")
			return true
		}
		store, ok := s.Store.(interface {
			Movers(context.Context, string, int) (json.RawMessage, error)
		})
		if !ok {
			failure(w, 503, "Native movers storage unavailable")
			return true
		}
		raw, err := store.Movers(ctx, exchange, limit)
		if err != nil {
			failure(w, 503, "Movers could not load. Please retry.")
		} else {
			respond(w, 200, map[string]any{"data": raw})
		}
		return true
	}
	if !strings.HasPrefix(r.URL.Path, "/api/v1/announcements/") {
		return false
	}
	symbol := strings.TrimPrefix(r.URL.Path, "/api/v1/announcements/")
	if symbol == "" || strings.Contains(symbol, "/") {
		failure(w, 404, "Not found")
		return true
	}
	limit, err := intQuery(r.URL.Query(), "limit", 50, 1, 100)
	if err != nil {
		failure(w, 400, "Invalid announcement limit")
		return true
	}
	store, ok := s.Store.(interface {
		SecurityID(context.Context, string, string) (*string, error)
		Announcements(context.Context, string, int) ([]json.RawMessage, error)
	})
	if !ok {
		failure(w, 503, "Native announcement storage unavailable")
		return true
	}
	id, err := store.SecurityID(ctx, exchange, strings.ToUpper(symbol))
	if err != nil {
		failure(w, 503, "Announcements could not load. Please retry.")
		return true
	}
	if id == nil {
		failure(w, 404, "Unknown symbol "+symbol)
		return true
	}
	rows, err := store.Announcements(ctx, *id, limit)
	if err != nil {
		failure(w, 503, "Announcements could not load. Please retry.")
		return true
	}
	if rows == nil {
		rows = []json.RawMessage{}
	}
	respond(w, 200, map[string]any{"data": rows})
	return true
}
