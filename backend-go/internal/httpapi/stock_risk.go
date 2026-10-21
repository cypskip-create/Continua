package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/engine"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

type riskHistoryStore interface {
	Candles(context.Context, string, string, time.Time, time.Time) ([]json.RawMessage, error)
	CorporateActions(context.Context, string) ([]json.RawMessage, error)
}

func (s *Server) stockRisk(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity) bool {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/engine/risk/") {
		return false
	}
	if err := auth.RequirePremium(id); err != nil {
		failure(w, auth.AccessStatus(err), err.Error())
		return true
	}
	symbol := strings.TrimPrefix(r.URL.Path, "/api/v1/engine/risk/")
	if r.Method != "GET" {
		failure(w, 405, "Method not allowed")
		return true
	}
	if !companySymbol.MatchString(symbol) {
		failure(w, 400, "Invalid stock symbol")
		return true
	}
	store, ok := s.Store.(riskHistoryStore)
	if !ok || s.EngineBundles == nil || s.Engine == nil {
		failure(w, 503, "Stock risk unavailable")
		return true
	}
	bundle, err := s.EngineBundles.Bundle(ctx, symbol, "NSE")
	if err != nil {
		failure(w, 503, "Stock evidence unavailable")
		return true
	}
	now := time.Now().UTC()
	bars, err := store.Candles(ctx, "NSE:"+symbol, "1d", now.Add(-400*24*time.Hour), now)
	if err != nil {
		failure(w, 503, "Price history unavailable")
		return true
	}
	actions, err := store.CorporateActions(ctx, "NSE:"+symbol)
	if err != nil {
		failure(w, 503, "Corporate action evidence unavailable")
		return true
	}
	result, err := s.Engine.Calculate(ctx, engine.Request{Operation: "stock_risk", Args: []any{bundle, bars, actions, now.Format(time.RFC3339Nano)}})
	if err != nil || !json.Valid(result) {
		failure(w, 503, "Stock risk calculation unavailable")
		return true
	}
	w.Header().Set("Cache-Control", "no-store")
	respond(w, 200, map[string]any{"data": result})
	return true
}
