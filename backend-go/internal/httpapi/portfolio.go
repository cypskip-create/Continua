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
