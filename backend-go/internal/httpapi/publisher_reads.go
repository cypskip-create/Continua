package httpapi

import (
	"context"
	"continua/backend/internal/engine"
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

type PublisherStore interface {
	SecurityID(context.Context, string, string) (*string, error)
	CompanyProfile(context.Context, string, string) (json.RawMessage, error)
	PublisherProfileRows(context.Context, string) ([]json.RawMessage, error)
	PublisherFinancialRows(context.Context, string) ([]json.RawMessage, error)
}

var publisherTicker = regexp.MustCompile(`^[A-Z0-9-]{1,20}$`)

func (s *Server) publisherReads(ctx context.Context, w http.ResponseWriter, r *http.Request, exchange string) bool {
	path := r.URL.Path
	profile := strings.HasPrefix(path, "/api/v1/companies/")
	financial := strings.HasPrefix(path, "/api/v1/financials/") && strings.HasSuffix(path, "/publisher-tables")
	if !profile && !financial {
		return false
	}
	store, ok := s.Store.(PublisherStore)
	if !ok {
		failure(w, 501, "Native publisher storage is not configured.")
		return true
	}
	segments := strings.Split(strings.TrimPrefix(path, "/api/v1/"), "/")
	if (profile && len(segments) != 2) || (financial && len(segments) != 3) || segments[1] == "" {
		failure(w, 404, "Not found")
		return true
	}
	original, symbol := segments[1], strings.ToUpper(segments[1])
	if profile {
		raw, e := store.CompanyProfile(ctx, exchange, symbol)
		if e != nil {
			failure(w, 500, "Internal server error")
			return true
		}
		if len(raw) == 0 {
			failure(w, 404, "No company found for "+original+" on "+exchange)
			return true
		}
		var data map[string]json.RawMessage
		if json.Unmarshal(raw, &data) != nil {
			failure(w, 500, "Internal server error")
			return true
		}
		var company map[string]any
		if json.Unmarshal(data["company"], &company) != nil {
			failure(w, 500, "Internal server error")
			return true
		}
		missingHeadquarters := company["headquarters"] == nil
		missingWebsite := company["website"] == nil
		if exchange == "NSE" && (missingHeadquarters || missingWebsite || company["headquarters"] == "" || company["website"] == "") && s.Engine != nil {
			rows, e := store.PublisherProfileRows(ctx, symbol)
			if e == nil && len(rows) > 0 {
				var observed struct {
					Tables     json.RawMessage `json:"tables"`
					SourceURL  string          `json:"sourceUrl"`
					ObservedAt string          `json:"observedAt"`
				}
				if json.Unmarshal(rows[0], &observed) == nil {
					calculated, e := s.Engine.Calculate(ctx, engine.Request{Operation: "publisher_profile", Args: []any{observed.Tables, company["name"]}})
					if e == nil && string(calculated) != "null" {
						var supplement map[string]any
						if json.Unmarshal(calculated, &supplement) == nil {
							if missingHeadquarters {
								company["headquarters"] = supplement["headquarters"]
							}
							if missingWebsite {
								company["website"] = supplement["website"]
							}
							company["profileSourceUrl"] = observed.SourceURL
							company["profileObservedAt"] = observed.ObservedAt
						}
					}
				}
			}
		}
		// Undefined fallback fields are omitted by the JS reference. Explicit null
		// publisher facts stay null when a matching observation was found.
		if _, observed := company["profileSourceUrl"]; !observed {
			if missingHeadquarters {
				delete(company, "headquarters")
			}
			if missingWebsite {
				delete(company, "website")
			}
		}
		encoded, e := json.Marshal(company)
		if e != nil {
			failure(w, 500, "Internal server error")
			return true
		}
		data["company"] = encoded
		respond(w, 200, map[string]any{"data": data})
		return true
	}
	id, e := store.SecurityID(ctx, "NSE", symbol)
	if e != nil {
		failure(w, 500, "Internal server error")
		return true
	}
	if id == nil {
		failure(w, 404, "Unknown NSE symbol")
		return true
	}
	ticker := map[string]string{"DTB": "DTK", "STANBIC": "SBIC", "HFCB": "HFCK"}[symbol]
	if ticker == "" {
		ticker = symbol
	}
	if !publisherTicker.MatchString(ticker) {
		respond(w, 200, map[string]any{"data": []any{}})
		return true
	}
	if s.Engine == nil {
		failure(w, 503, "Native publisher validation worker is not configured.")
		return true
	}
	rows, e := store.PublisherFinancialRows(ctx, ticker)
	if e != nil {
		failure(w, 500, "Internal server error")
		return true
	}
	out := []map[string]any{}
	for _, row := range rows {
		var observed struct {
			Tables     json.RawMessage `json:"tables"`
			SourceURL  string          `json:"sourceUrl"`
			ObservedAt string          `json:"observedAt"`
		}
		if json.Unmarshal(row, &observed) != nil {
			continue
		}
		u, e := url.Parse(observed.SourceURL)
		if e != nil || u.Scheme != "https" || u.Hostname() != "kenyanstocks.com" || (u.Port() != "" && u.Port() != "443") || u.User != nil || u.EscapedPath() != "/stock/nse/"+ticker || u.Query().Get("tab") != "Financials" {
			continue
		}
		raw, e := s.Engine.Calculate(ctx, engine.Request{Operation: "source_financial_tables", Args: []any{observed.Tables}})
		if e != nil {
			failure(w, 503, "Native publisher validation is unavailable.")
			return true
		}
		var tables []map[string]any
		if json.Unmarshal(raw, &tables) != nil {
			failure(w, 500, "Internal server error")
			return true
		}
		if u.Port() == "443" {
			u.Host = u.Hostname()
		}
		for _, table := range tables {
			table["sourceUrl"] = u.String()
			table["observedAt"] = observed.ObservedAt
			table["status"] = "publisher_observation"
			out = append(out, table)
		}
	}
	respond(w, 200, map[string]any{"data": out})
	return true
}
