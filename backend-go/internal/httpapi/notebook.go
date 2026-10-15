package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/engine"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

type NotebookService interface {
	List(context.Context, string) (json.RawMessage, error)
	Mutate(context.Context, string, string, string, json.RawMessage) (json.RawMessage, error)
}

func (s *Server) notebook(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity) bool {
	const prefix = "/api/v1/engine/notebook"
	if r.URL.Path != prefix && !strings.HasPrefix(r.URL.Path, prefix+"/") {
		return false
	}
	if err := auth.RequirePlus(id); err != nil {
		failure(w, auth.AccessStatus(err), err.Error())
		return true
	}
	if s.Notebook == nil {
		failure(w, 503, "Native private notebook unavailable")
		return true
	}
	var data json.RawMessage
	var err error
	status := 200
	if r.URL.Path == prefix && r.Method == "GET" {
		data, err = s.Notebook.List(ctx, id.UserID)
	} else if r.Method == "POST" {
		target, action := "", "create"
		if r.URL.Path != prefix {
			parts := strings.Split(strings.TrimPrefix(r.URL.Path, prefix+"/"), "/")
			if len(parts) != 2 || !workspaceUUID.MatchString(parts[0]) || (parts[1] != "revise" && parts[1] != "resolve") {
				failure(w, 400, "Invalid forecast action")
				return true
			}
			target, action = parts[0], parts[1]
		} else {
			status = 201
		}
		raw, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 65536))
		if e != nil {
			failure(w, 413, "Forecast request too large")
			return true
		}
		if !json.Valid(raw) {
			failure(w, 400, "Invalid forecast JSON")
			return true
		}
		data, err = s.Notebook.Mutate(ctx, id.UserID, target, action, raw)
	} else {
		failure(w, 405, "Method not allowed")
		return true
	}
	if err != nil {
		var e *engine.NotebookError
		if errors.As(err, &e) {
			failure(w, e.Status, e.Message)
		} else {
			failure(w, 503, "Private notebook unavailable. Previous entries remain unchanged.")
		}
		return true
	}
	respond(w, status, map[string]any{"data": data})
	return true
}
