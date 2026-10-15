package httpapi

import (
	"context"
	"continua/backend/internal/engine"
	"encoding/json"
	"net/http"
	"strings"
)

type MarketResearchStore interface {
	MarketSnapshot(context.Context) ([]json.RawMessage, error)
	ResearchRecords(context.Context) (json.RawMessage, error)
	MarketEarnings(context.Context) ([]json.RawMessage, error)
}

func (s *Server) marketResearch(ctx context.Context, w http.ResponseWriter, r *http.Request) bool {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/market-research/") {
		return false
	}
	store, ok := s.Store.(MarketResearchStore)
	if !ok {
		failure(w, 503, "Native market research unavailable")
		return true
	}
	var data any
	var err error
	switch strings.TrimPrefix(r.URL.Path, "/api/v1/market-research/") {
	case "records":
		data, err = store.ResearchRecords(ctx)
	case "earnings":
		var rows []json.RawMessage
		rows, err = store.MarketEarnings(ctx)
		if rows == nil {
			rows = []json.RawMessage{}
		}
		data = rows
	case "intelligence":
		if s.Engine == nil {
			failure(w, 503, "Native market research calculations unavailable")
			return true
		}
		rows, e := store.MarketSnapshot(ctx)
		if e != nil {
			err = e
			break
		}
		if rows == nil {
			rows = []json.RawMessage{}
		}
		data, err = s.Engine.Calculate(ctx, engine.Request{Operation: "analyse_market", Args: []any{rows}})
	default:
		failure(w, 404, "Not found")
		return true
	}
	if err != nil {
		failure(w, 503, "Market research could not load. Please retry.")
		return true
	}
	respond(w, 200, map[string]any{"data": data})
	return true
}
