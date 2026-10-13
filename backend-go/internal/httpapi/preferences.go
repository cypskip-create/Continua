package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/engine"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5/pgconn"
	"io"
	"net/http"
	"regexp"
	"strings"
)

type PreferenceStore interface {
	Preferences(context.Context, string) (json.RawMessage, error)
	SavePreferences(context.Context, string, json.RawMessage) (json.RawMessage, error)
	RecordInterest(context.Context, string, string, string, bool) (json.RawMessage, error)
}

var interestSymbol = regexp.MustCompile(`^[A-Z0-9.\-]{1,20}$`)

func (s *Server) preferences(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity) bool {
	path := r.URL.Path
	matched := (path == "/api/v1/engine/preferences" && (r.Method == http.MethodGet || r.Method == http.MethodPost)) || (path == "/api/v1/engine/recommendations" && r.Method == http.MethodGet) || (path == "/api/v1/engine/interests" && r.Method == http.MethodPost)
	if !matched {
		return false
	}
	if err := auth.RequirePlus(id); err != nil {
		failure(w, auth.AccessStatus(err), err.Error())
		return true
	}
	if s.PreferencesStore == nil || s.Engine == nil {
		failure(w, 503, "Native Engine preference persistence is not configured.")
		return true
	}
	var data json.RawMessage
	var err error
	if r.Method == http.MethodGet {
		data, err = s.PreferencesStore.Preferences(ctx, id.UserID)
		if err == nil && path == "/api/v1/engine/recommendations" {
			data, err = s.Engine.Calculate(ctx, engine.Request{Operation: "recommendations", Args: []any{data}})
		}
	} else {
		raw, e := io.ReadAll(io.LimitReader(r.Body, 65537))
		if e != nil || len(raw) > 65536 || !json.Valid(raw) {
			failure(w, 400, "Invalid Engine request")
			return true
		}
		if path == "/api/v1/engine/preferences" {
			data, err = s.PreferencesStore.SavePreferences(ctx, id.UserID, raw)
		} else {
			var fields map[string]json.RawMessage
			_ = json.Unmarshal(raw, &fields)
			var input struct {
				Symbol   string `json:"symbol"`
				Exchange string `json:"exchange"`
				Reset    bool   `json:"reset"`
			}
			if fields == nil || json.Unmarshal(raw, &input) != nil || (fields["reset"] != nil && string(fields["reset"]) == "null") {
				failure(w, 400, "Invalid Engine request")
				return true
			}
			input.Symbol = strings.ToUpper(strings.TrimSpace(input.Symbol))
			if !interestSymbol.MatchString(input.Symbol) {
				failure(w, 400, "Invalid Engine symbol")
				return true
			}
			if fields["exchange"] == nil {
				input.Exchange = "NSE"
			}
			if input.Exchange != "NSE" {
				failure(w, 400, "Invalid exchange")
				return true
			}
			data, err = s.PreferencesStore.RecordInterest(ctx, id.UserID, input.Symbol, input.Exchange, input.Reset)
		}
	}
	if err != nil {
		if errors.Is(err, engine.ErrInvalidPreferences) {
			failure(w, 400, "Invalid Engine preferences")
			return true
		}
		var postgres *pgconn.PgError
		if errors.As(err, &postgres) && postgres.Code == "42P01" {
			failure(w, 503, "Engine persistence requires the latest database migration. Ask the administrator to deploy it.")
			return true
		}
		failure(w, 503, "Engine preferences are temporarily unavailable. Please retry.")
		return true
	}
	respond(w, 200, map[string]any{"data": data})
	return true
}
