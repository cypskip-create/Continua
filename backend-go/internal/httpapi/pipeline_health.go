package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/jobs"
	"encoding/json"
	"net/http"
	"time"
)

type PipelineHealthStore interface {
	Ping(context.Context) error
	QuoteFreshness(context.Context) (int64, int64, error)
	ValidationOutcomes(context.Context) ([]json.RawMessage, error)
}

func (s *Server) pipelineHealth(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity) bool {
	if r.URL.Path != "/api/v1/engine/pipeline-health" {
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
	store, ok := s.Store.(PipelineHealthStore)
	if !ok {
		failure(w, 503, "Native pipeline diagnostics unavailable")
		return true
	}
	raw, e := s.ReadCache.GetOrLoad(ctx, "pipeline-health", 5*time.Second, func(ctx context.Context) (json.RawMessage, error) {
		ctx, cancel := context.WithTimeout(ctx, 4*time.Second)
		defer cancel()
		now := time.Now().UTC()
		checks := []map[string]any{}
		dbOK := store.Ping(ctx) == nil
		checks = append(checks, map[string]any{"name": "database", "ok": dbOK})
		s.ReadCache.Set("healthcheck:ping", json.RawMessage(`"pong"`), 5*time.Second)
		cacheOK := string(s.ReadCache.Get("healthcheck:ping")) == `"pong"`
		if health, ok := s.ReadCache.(interface{ Health(context.Context) error }); ok {
			cacheOK = cacheOK && health.Health(ctx) == nil
		}
		checks = append(checks, map[string]any{"name": "cache", "ok": cacheOK})
		freshOK := true
		if dbOK {
			total, stale, e := store.QuoteFreshness(ctx)
			freshOK = e == nil && (!jobs.MarketOpen("NSE", now, s.IgnoreCalendar) || total == 0 || stale == 0)
			checks = append(checks, map[string]any{"name": "quoteFreshness", "ok": freshOK})
		}
		status := "healthy"
		if !dbOK {
			status = "unhealthy"
		} else if !cacheOK || !freshOK {
			status = "degraded"
		}
		validations, e := store.ValidationOutcomes(ctx)
		if e != nil {
			return nil, e
		}
		return json.Marshal(map[string]any{"checkedAt": now.Format("2006-01-02T15:04:05.000Z"), "status": status, "checks": checks, "validations": validations, "limits": []string{"Counts describe recorded validation outcomes, not complete issuer/year coverage.", "Unsupported OCR and conflicts remain in review; confidence alone cannot approve publication.", "Always-on hosting and paid AI are disabled by user choice; free-instance sleep remains possible."}, "methodology": "Operational health is separate from financial evidence quality. No private errors, credentials or user activity are returned."})
	})
	if e != nil {
		failure(w, 503, "Pipeline diagnostics are temporarily unavailable")
		return true
	}
	respond(w, 200, map[string]any{"data": raw})
	return true
}
