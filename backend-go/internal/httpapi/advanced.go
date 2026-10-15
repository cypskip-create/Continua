package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/engine"
	"encoding/json"
	"io"
	"net/http"
	"time"
)

func (s *Server) advanced(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity) bool {
	if r.URL.Path != "/api/v1/engine/labs/advanced" {
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
	if s.Advanced == nil {
		failure(w, 503, "Native advanced research unavailable")
		return true
	}
	select {
	case s.largeBodies <- struct{}{}:
		defer func() { <-s.largeBodies }()
	default:
		w.Header().Set("Retry-After", "1")
		failure(w, 429, "Research capacity reached. Retry shortly.")
		return true
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 8388608))
	if err != nil {
		failure(w, 413, "Research input too large")
		return true
	}
	if !json.Valid(raw) {
		failure(w, 400, "Invalid advanced research JSON")
		return true
	}
	result, err := s.Advanced.Calculate(ctx, engine.Request{Operation: "run_advanced", Args: []any{json.RawMessage(raw), time.Now().UTC().Format("2006-01-02T15:04:05.000Z")}})
	if err != nil {
		failure(w, 503, "Research calculation unavailable. No inputs were published.")
		return true
	}
	var envelope struct {
		Status int             `json:"status"`
		Data   json.RawMessage `json:"data"`
		Error  string          `json:"error"`
	}
	if json.Unmarshal(result, &envelope) != nil {
		failure(w, 503, "Invalid research result")
		return true
	}
	if envelope.Status == 400 || envelope.Status == 422 {
		failure(w, envelope.Status, envelope.Error)
		return true
	}
	if envelope.Status != 200 || !json.Valid(envelope.Data) {
		failure(w, 503, "Invalid research result")
		return true
	}
	respond(w, 200, map[string]any{"data": envelope.Data})
	return true
}
