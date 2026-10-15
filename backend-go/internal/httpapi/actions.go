package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

type ActionStore interface {
	SecurityID(context.Context, string, string) (*string, error)
	CorporateActions(context.Context, string) ([]json.RawMessage, error)
	Dividends(context.Context, string) ([]json.RawMessage, error)
	UpcomingDividends(context.Context, string, int) ([]json.RawMessage, error)
	RecentEarnings(context.Context, string, int) ([]json.RawMessage, error)
	Earnings(context.Context, string, int) ([]json.RawMessage, error)
	Ownership(context.Context, string) ([]json.RawMessage, error)
}

func (s *Server) actionReads(ctx context.Context, w http.ResponseWriter, r *http.Request, exchange string) bool {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/v1/"), "/")
	if len(parts) == 0 || !map[string]bool{"corporate-actions": true, "dividends": true, "earnings": true, "ownership": true}[parts[0]] {
		return false
	}
	if len(parts) != 2 || parts[1] == "" {
		failure(w, 404, "Not found")
		return true
	}
	store, ok := s.Store.(ActionStore)
	if !ok {
		failure(w, 501, "Native corporate action storage is not configured.")
		return true
	}
	var data []json.RawMessage
	var err error
	if (parts[0] == "dividends" && parts[1] == "upcoming") || (parts[0] == "earnings" && parts[1] == "recent") {
		limit, e := intQuery(r.URL.Query(), "limit", 20, 1, 100)
		if e != nil {
			failure(w, 400, "Invalid limit")
			return true
		}
		if parts[0] == "dividends" {
			data, err = store.UpcomingDividends(ctx, exchange, limit)
		} else {
			data, err = store.RecentEarnings(ctx, exchange, limit)
		}
	} else {
		id, e := store.SecurityID(ctx, exchange, strings.ToUpper(parts[1]))
		if e != nil {
			failure(w, 500, "Internal server error")
			return true
		}
		if id == nil {
			failure(w, 404, "Unknown symbol "+parts[1])
			return true
		}
		switch parts[0] {
		case "corporate-actions":
			data, err = store.CorporateActions(ctx, *id)
		case "dividends":
			data, err = store.Dividends(ctx, *id)
		case "earnings":
			data, err = store.Earnings(ctx, *id, 12)
		case "ownership":
			data, err = store.Ownership(ctx, *id)
		}
	}
	if err != nil {
		failure(w, 500, "Internal server error")
		return true
	}
	if data == nil {
		data = []json.RawMessage{}
	}
	respond(w, 200, map[string]any{"data": data})
	return true
}
