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
	"time"
	"unicode/utf16"
)

func (s *Server) assistant(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity) bool {
	if r.URL.Path != "/api/v1/engine/assistant" {
		return false
	}
	if e := auth.RequirePlus(id); e != nil {
		failure(w, auth.AccessStatus(e), e.Error())
		return true
	}
	if r.Method != "POST" {
		failure(w, 405, "Method not allowed")
		return true
	}
	var body struct {
		Question string          `json:"question"`
		Symbols  []string        `json:"symbols"`
		Exchange json.RawMessage `json:"exchange"`
		Scope    json.RawMessage `json:"scope"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16384))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&body) != nil || decoder.Decode(new(any)) != io.EOF {
		failure(w, 400, "Invalid Engine request")
		return true
	}
	body.Question = strings.TrimSpace(body.Question)
	length := len(utf16.Encode([]rune(body.Question)))
	exchange, scope := "NSE", "company"
	if body.Exchange != nil {
		exchange = ""
		if json.Unmarshal(body.Exchange, &exchange) != nil {
			failure(w, 400, "Invalid exchange")
			return true
		}
	}
	if body.Scope != nil {
		scope = ""
		if json.Unmarshal(body.Scope, &scope) != nil {
			failure(w, 400, "Invalid scope")
			return true
		}
	}
	if length < 3 || length > 2000 || len(body.Symbols) < 1 || len(body.Symbols) > 3 || exchange != "NSE" || (scope != "company" && scope != "portfolio") {
		failure(w, 400, "Invalid Engine request")
		return true
	}
	for i, symbol := range body.Symbols {
		body.Symbols[i] = strings.ToUpper(strings.TrimSpace(symbol))
		if !companySymbol.MatchString(body.Symbols[i]) {
			failure(w, 400, "Invalid stock symbol")
			return true
		}
	}
	if s.Advanced == nil {
		failure(w, 503, "Calculated evidence assistant unavailable")
		return true
	}
	companies := map[string]json.RawMessage{}
	ordered := []map[string]any{}
	var portfolio json.RawMessage
	if scope == "portfolio" {
		if s.PortfolioResearch == nil {
			failure(w, 503, "Portfolio research unavailable")
			return true
		}
		raw, e := s.PortfolioResearch.Research(ctx, id.UserID, exchange)
		if e != nil {
			failure(w, 503, "Portfolio research unavailable")
			return true
		}
		portfolio = raw
	} else {
		if s.EngineBundles == nil {
			failure(w, 503, "Company research unavailable")
			return true
		}
		for _, symbol := range body.Symbols {
			if _, exists := companies[symbol]; exists {
				continue
			}
			raw, e := s.EngineBundles.Bundle(ctx, symbol, exchange)
			if e != nil {
				failure(w, 503, "Company evidence unavailable")
				return true
			}
			companies[symbol] = raw
			ordered = append(ordered, map[string]any{"symbol": symbol, "bundle": raw})
		}
	}
	// Evidence is built from verified server research, never client-supplied facts.
	if s.Assistant.Enabled() {
		evidence, e := s.Advanced.Calculate(ctx, engine.Request{Operation: "assistant_evidence", Args: []any{ordered, portfolio, time.Now().UTC().Format("2006-01-02T15:04:05.000Z")}})
		if e != nil {
			failure(w, 503, "Company evidence unavailable")
			return true
		}
		preferences := json.RawMessage(`{}`)
		if s.PreferencesStore != nil {
			preferences, e = s.PreferencesStore.Preferences(ctx, id.UserID)
			if e != nil {
				failure(w, 503, "Engine preferences unavailable")
				return true
			}
		}
		answer, e := s.Assistant.Ask(ctx, id.UserID, body.Question, evidence, preferences)
		if e != nil {
			var provider *engine.AssistantError
			if errors.As(e, &provider) {
				failure(w, provider.Status, provider.Message)
			} else {
				failure(w, 503, "Evidence assistant unavailable")
			}
		} else {
			respond(w, 200, map[string]any{"data": answer})
		}
		return true
	}
	raw, e := s.Advanced.Calculate(ctx, engine.Request{Operation: "assistant_answer", Args: []any{body.Question, ordered, portfolio, time.Now().UTC().Format("2006-01-02T15:04:05.000Z")}})
	if e != nil || !json.Valid(raw) {
		failure(w, 503, "Calculated evidence answer unavailable")
		return true
	}
	respond(w, 200, map[string]any{"data": raw})
	return true
}
