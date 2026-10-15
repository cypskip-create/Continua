package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"encoding/json"
	"net/http"
)

type UsageStore interface {
	AIUsage(context.Context, string) (json.RawMessage, error)
}

func (s *Server) usage(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity) bool {
	if r.URL.Path != "/api/v1/engine/usage" {
		return false
	}
	if e := auth.RequirePlus(id); e != nil {
		failure(w, auth.AccessStatus(e), e.Error())
		return true
	}
	if r.Method != "GET" {
		failure(w, 405, "Method not allowed")
		return true
	}
	store, ok := s.Store.(UsageStore)
	if !ok {
		failure(w, 503, "Native usage storage unavailable")
		return true
	}
	raw, e := store.AIUsage(ctx, id.UserID)
	if e != nil {
		failure(w, 503, "Engine usage is unavailable. Please retry.")
		return true
	}
	var data map[string]any
	if json.Unmarshal(raw, &data) != nil || data == nil {
		failure(w, 503, "Invalid usage result")
		return true
	}
	data["monthlyApplicationCap"] = s.AIMonthlyCap
	data["dailyUserLimit"] = s.AIDailyLimit
	data["model"] = "gpt-5.4-mini"
	data["configured"] = s.Assistant.Enabled()
	respond(w, 200, map[string]any{"data": data})
	return true
}
