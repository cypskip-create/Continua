package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/engine"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
)

type CompanyBundles interface {
	Bundle(context.Context, string, string) (json.RawMessage, error)
}

var companySymbol = regexp.MustCompile(`^[A-Z0-9.\-]{1,20}$`)

func (s *Server) companyResearch(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity, exchange string) bool {
	if !strings.HasPrefix(r.URL.Path, "/api/v1/engine/") {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/v1/engine/"), "/")
	// An unfinished named workspace route must not masquerade as an unknown
	// company. Dedicated native handlers run first; remaining routes stay explicit.
	if len(parts) == 1 && map[string]bool{"usage": true, "assistant": true, "portfolio": true, "peers": true, "pipeline-health": true, "financial-versions": true, "notebook": true, "preferences": true, "recommendations": true, "monitoring": true, "cash-flows": true, "interests": true}[parts[0]] {
		return false
	}
	basic := len(parts) == 2 && parts[0] == "basic"
	if !basic && len(parts) != 1 {
		return false
	}
	symbol := strings.ToUpper(parts[len(parts)-1])
	if err := auth.RequirePremium(id); err != nil {
		failure(w, auth.AccessStatus(err), err.Error())
		return true
	}
	if !companySymbol.MatchString(symbol) {
		failure(w, 400, "Invalid stock symbol")
		return true
	}
	if s.EngineBundles == nil {
		failure(w, 503, "Native company research is not configured.")
		return true
	}
	raw, err := s.EngineBundles.Bundle(ctx, symbol, exchange)
	if err != nil {
		if errors.Is(err, engine.ErrUnknownCompany) {
			failure(w, 404, err.Error())
		} else {
			failure(w, 503, "Company research could not load. Please retry.")
		}
		return true
	}
	if !json.Valid(raw) {
		failure(w, 503, "Company research could not load. Please retry.")
		return true
	}
	if !basic {
		respond(w, 200, map[string]any{"data": raw})
		return true
	}
	var full map[string]json.RawMessage
	if json.Unmarshal(raw, &full) != nil || full == nil {
		failure(w, 503, "Company research could not load. Please retry.")
		return true
	}
	brief := map[string]json.RawMessage{}
	for _, key := range []string{"symbol", "companyName", "currency", "quote", "generatedAt", "briefing", "coverage", "unavailable"} {
		if full[key] != nil {
			brief[key] = full[key]
		}
	}
	var estimates []map[string]json.RawMessage
	if json.Unmarshal(full["estimates"], &estimates) != nil {
		failure(w, 503, "Company research could not load. Please retry.")
		return true
	}
	sanitized := []map[string]json.RawMessage{}
	for _, e := range estimates {
		value := map[string]json.RawMessage{}
		for _, key := range []string{"fiscalYear", "fiscalQuarter", "epsEstimate", "revenueEstimate"} {
			if e[key] != nil {
				value[key] = e[key]
			}
		}
		sanitized = append(sanitized, value)
	}
	brief["estimates"], _ = json.Marshal(sanitized)
	respond(w, 200, map[string]any{"data": brief})
	return true
}
