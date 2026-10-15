package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

type StoredResearch interface {
	SecurityID(context.Context, string, string) (*string, error)
	Ratios(context.Context, string) (json.RawMessage, error)
	AfriScore(context.Context, string) (json.RawMessage, error)
}
type ResearchRecompute interface {
	Recompute(context.Context, string) (json.RawMessage, error)
}
type ResearchFreshness interface {
	ResearchIsCurrent(context.Context, string, json.RawMessage, json.RawMessage) (bool, error)
}

func (s *Server) storedResearch(ctx context.Context, w http.ResponseWriter, r *http.Request, exchange string) bool {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/research/") {
		return false
	}
	original := strings.TrimPrefix(r.URL.Path, "/api/v1/research/")
	symbol := strings.ToUpper(original)
	if symbol == "" || strings.Contains(symbol, "/") {
		failure(w, 404, "Not found")
		return true
	}
	store, ok := s.Store.(StoredResearch)
	if !ok {
		failure(w, 503, "Native research storage is not configured.")
		return true
	}
	id, err := store.SecurityID(ctx, exchange, symbol)
	if err != nil {
		failure(w, 500, "Internal server error")
		return true
	}
	if id == nil {
		failure(w, 404, "Unknown symbol "+original)
		return true
	}
	ratiosKey, scoreKey := "ratios:"+exchange+":"+symbol, "afriscore:"+exchange+":"+symbol
	ratios, err := s.ReadCache.GetOrLoad(ctx, ratiosKey, time.Minute, func(ctx context.Context) (json.RawMessage, error) { return store.Ratios(ctx, *id) })
	if err != nil {
		failure(w, 500, "Internal server error")
		return true
	}
	score, err := s.ReadCache.GetOrLoad(ctx, scoreKey, time.Minute, func(ctx context.Context) (json.RawMessage, error) { return store.AfriScore(ctx, *id) })
	if err != nil {
		failure(w, 500, "Internal server error")
		return true
	}
	current := ratios != nil && score != nil
	if current {
		if freshness, ok := s.Store.(ResearchFreshness); ok {
			current, err = freshness.ResearchIsCurrent(ctx, *id, ratios, score)
			if err != nil {
				failure(w, 503, "Research freshness could not be verified. Please retry.")
				return true
			}
		}
	}
	if !current && s.Recompute == nil {
		failure(w, 503, "Current dated research is unavailable. Please retry.")
		return true
	}
	if !current && s.Recompute != nil {
		raw, e := s.Recompute.Recompute(ctx, *id)
		if e != nil {
			failure(w, 503, "Research data could not load. Please retry.")
			return true
		}
		if raw != nil {
			var result struct {
				Ratios json.RawMessage `json:"ratios"`
				Score  json.RawMessage `json:"score"`
			}
			if json.Unmarshal(raw, &result) != nil || !json.Valid(result.Ratios) || !json.Valid(result.Score) {
				failure(w, 503, "Research data could not load. Please retry.")
				return true
			}
			ratios, score = result.Ratios, result.Score
			s.ReadCache.Set(ratiosKey, ratios, time.Minute)
			s.ReadCache.Set(scoreKey, score, time.Minute)
		} else {
			ratios, score = nil, nil
			s.ReadCache.Delete(ratiosKey)
			s.ReadCache.Delete(scoreKey)
		}
	}
	if ratios == nil || score == nil {
		failure(w, 404, "Research data not available yet for this symbol")
		return true
	}
	respond(w, 200, map[string]any{"data": map[string]json.RawMessage{"ratios": ratios, "score": score}})
	return true
}
