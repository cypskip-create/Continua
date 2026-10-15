package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/engine"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

func (s *Server) riskLabs(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity) bool {
	kind := strings.TrimPrefix(r.URL.Path, "/api/v1/engine/labs/")
	if kind != "bond" && kind != "futures" && kind != "earnings-sensitivity" && kind != "stress" {
		return false
	}
	if err := auth.RequirePlus(id); err != nil {
		failure(w, auth.AccessStatus(err), err.Error())
		return true
	}
	if r.Method != "POST" {
		failure(w, 405, "Method not allowed")
		return true
	}
	if s.Engine == nil {
		failure(w, 503, "Native risk calculation unavailable")
		return true
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 65536))
	if err != nil {
		failure(w, 413, "Risk assumptions too large")
		return true
	}
	if !json.Valid(raw) {
		failure(w, 400, "Invalid risk assumptions")
		return true
	}
	operation := "lab_calculation"
	args := []any{kind, json.RawMessage(raw), time.Now().UTC().Format("2006-01-02T15:04:05.000Z")}
	if kind == "stress" {
		store, ok := s.Store.(PortfolioStore)
		if !ok {
			failure(w, 503, "Native portfolio storage unavailable")
			return true
		}
		positions, e := store.PortfolioPositions(ctx, id.UserID, "NSE")
		if e != nil {
			failure(w, 503, "Portfolio holdings unavailable")
			return true
		}
		operation = "stress_workspace"
		args = []any{json.RawMessage(raw), positions, time.Now().UTC().Format("2006-01-02T15:04:05.000Z")}
	}
	if kind == "earnings-sensitivity" {
		var input struct {
			Symbol string `json:"symbol"`
		}
		if json.Unmarshal(raw, &input) != nil || !companySymbol.MatchString(strings.ToUpper(strings.TrimSpace(input.Symbol))) {
			failure(w, 400, "Invalid stock symbol")
			return true
		}
		if s.EngineBundles == nil {
			failure(w, 503, "Native company research unavailable")
			return true
		}
		bundle, e := s.EngineBundles.Bundle(ctx, strings.ToUpper(strings.TrimSpace(input.Symbol)), "NSE")
		if e != nil || !json.Valid(bundle) {
			failure(w, 503, "Company research could not load. Please retry.")
			return true
		}
		operation = "earnings_lab"
		args = []any{json.RawMessage(raw), bundle, time.Now().UTC().Format("2006-01-02T15:04:05.000Z")}
	}
	result, err := s.Engine.Calculate(ctx, engine.Request{Operation: operation, Args: args})
	if err != nil {
		failure(w, 503, "Risk calculation unavailable")
		return true
	}
	var envelope struct {
		Status int             `json:"status"`
		Data   json.RawMessage `json:"data"`
		Error  string          `json:"error"`
	}
	if json.Unmarshal(result, &envelope) != nil {
		failure(w, 503, "Invalid risk result")
		return true
	}
	if envelope.Status == 400 || envelope.Status == 422 {
		failure(w, envelope.Status, envelope.Error)
		return true
	}
	if envelope.Status != 200 || !json.Valid(envelope.Data) {
		failure(w, 503, "Invalid risk result")
		return true
	}
	respond(w, 200, map[string]any{"data": envelope.Data})
	return true
}
