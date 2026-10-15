package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/engine"
	"encoding/json"
	"net/http"
	"time"
)

type PortfolioStore interface {
	PortfolioPositions(context.Context, string, string) ([]json.RawMessage, error)
}

type PortfolioResearchService interface {
	Research(context.Context, string, string) (json.RawMessage, error)
}

func (s *Server) portfolioResearch(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity) bool {
	if r.URL.Path != "/api/v1/engine/portfolio" {
		return false
	}
	if err := auth.RequirePlus(id); err != nil {
		failure(w, auth.AccessStatus(err), err.Error())
		return true
	}
	if r.Method != "GET" {
		failure(w, 405, "Method not allowed")
		return true
	}
	exchange := r.URL.Query().Get("exchange")
	if !r.URL.Query().Has("exchange") {
		exchange = "NSE"
	}
	if exchange != "NSE" || len(r.URL.Query()["exchange"]) > 1 {
		failure(w, 400, "Invalid exchange")
		return true
	}
	if s.PortfolioResearch == nil {
		failure(w, 503, "Native portfolio research unavailable")
		return true
	}
	raw, err := s.PortfolioResearch.Research(ctx, id.UserID, exchange)
	if err != nil || !json.Valid(raw) {
		failure(w, 503, "Portfolio research is temporarily unavailable. Please retry.")
		return true
	}
	respond(w, 200, map[string]any{"data": raw})
	return true
}

func (s *Server) portfolioOverview(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity, exchange string) bool {
	if r.URL.Path != "/api/v1/engine/portfolio/overview" {
		return false
	}
	// Included free, but never public or keyed by a user's query argument.
	if id == nil || id.UserID == "" {
		failure(w, 401, "Authentication required")
		return true
	}
	store, ok := s.Store.(PortfolioStore)
	if !ok || s.Engine == nil {
		failure(w, 503, "Native portfolio overview is not configured.")
		return true
	}
	positions, err := store.PortfolioPositions(ctx, id.UserID, exchange)
	if err != nil {
		failure(w, 503, "Portfolio overview is temporarily unavailable. Please retry.")
		return true
	}
	data, err := s.Engine.Calculate(ctx, engine.Request{Operation: "portfolio_overview", Args: []any{positions, exchange, time.Now().UTC().Format(time.RFC3339Nano)}})
	if err != nil {
		failure(w, 503, "Portfolio overview is temporarily unavailable. Please retry.")
		return true
	}
	respond(w, 200, map[string]any{"data": data})
	return true
}
