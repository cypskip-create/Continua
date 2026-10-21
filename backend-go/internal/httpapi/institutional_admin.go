package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

type institutionalAdminStore interface {
	InstitutionalRead(context.Context, string, string, string) ([]json.RawMessage, error)
	InstitutionalAdmin(context.Context, string, string, json.RawMessage) ([]json.RawMessage, error)
}

// Called only after the existing constant-time admin-key authentication.
func (s *Server) institutionalAdmin(ctx context.Context, w http.ResponseWriter, r *http.Request, path string) bool {
	if path != "models" && !strings.HasPrefix(path, "models/") && path != "relationships/pending" && !strings.HasPrefix(path, "relationships/") {
		return false
	}
	w.Header().Set("Cache-Control", "no-store")
	store, ok := s.Admin.Store.(institutionalAdminStore)
	if !ok {
		failure(w, 503, "Governance storage unavailable")
		return true
	}
	if r.Method == "GET" && (path == "models" || path == "relationships/pending") {
		operation := "dashboard"
		if path != "models" {
			operation = "pending-relationships"
		}
		rows, e := store.InstitutionalRead(ctx, operation, "", "")
		if e != nil {
			failure(w, 503, "Governance unavailable")
		} else {
			respond(w, 200, map[string]any{"data": rows})
		}
		return true
	}
	if r.Method != "POST" {
		failure(w, 405, "Method not allowed")
		return true
	}
	raw, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 8192))
	var input struct {
		Version      string `json:"version"`
		Status       string `json:"status"`
		Verification string `json:"verification"`
		Note         string `json:"note"`
	}
	if e != nil || json.Unmarshal(raw, &input) != nil {
		failure(w, 400, "Invalid governance request")
		return true
	}
	parts := strings.Split(path, "/")
	if len(parts) != 3 {
		failure(w, 404, "Unknown governance action")
		return true
	}
	operation := ""
	if parts[0] == "models" && parts[2] == "status" {
		if len(input.Version) == 0 || len(input.Version) > 100 || (input.Status != "research" && input.Status != "review-required" && input.Status != "disabled") {
			failure(w, 400, "Explicit model version and status required")
			return true
		}
		operation = "model-status"
	}
	if parts[0] == "relationships" && parts[2] == "review" {
		if (input.Verification != "verified" && input.Verification != "rejected") || len(strings.TrimSpace(input.Note)) < 10 || len(input.Note) > 1000 {
			failure(w, 400, "Explicit verification and review note required")
			return true
		}
		input.Note = strings.TrimSpace(input.Note)
		raw, _ = json.Marshal(input)
		operation = "review-relationship"
	}
	if operation == "" {
		failure(w, 404, "Unknown governance action")
		return true
	}
	rows, e := store.InstitutionalAdmin(ctx, operation, parts[1], raw)
	if e != nil {
		failure(w, 503, "Governance update unavailable")
	} else if len(rows) == 0 {
		failure(w, 422, "Record missing or source permission unavailable")
	} else {
		respond(w, 200, map[string]any{"data": rows[0]})
	}
	return true
}
