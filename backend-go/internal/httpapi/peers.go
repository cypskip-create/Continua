package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/engine"
	"encoding/json"
	"net/http"
	"strings"
)

type PeerStore interface {
	CompanyProfile(context.Context, string, string) (json.RawMessage, error)
	Instruments(context.Context, string) ([]json.RawMessage, error)
	Ratios(context.Context, string) (json.RawMessage, error)
	FinancialHistory(context.Context, string, string, int) ([]json.RawMessage, error)
}

func (s *Server) peers(ctx context.Context, w http.ResponseWriter, r *http.Request, id *auth.Identity) bool {
	if r.URL.Path != "/api/v1/engine/peers" {
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
	q := r.URL.Query()
	symbol := strings.ToUpper(strings.TrimSpace(q.Get("symbol")))
	exchange := q.Get("exchange")
	if exchange == "" {
		exchange = "NSE"
	}
	if len(q["symbol"]) != 1 || len(q["exchange"]) > 1 || !companySymbol.MatchString(symbol) || exchange != "NSE" {
		failure(w, 400, "Invalid peer security")
		return true
	}
	store, ok := s.Store.(PeerStore)
	if !ok || s.Engine == nil {
		failure(w, 503, "Native peer research unavailable")
		return true
	}
	raw, e := store.CompanyProfile(ctx, exchange, symbol)
	if e != nil {
		failure(w, 503, "Peer universe unavailable")
		return true
	}
	out := []map[string]any{}
	if raw == nil {
		respond(w, 200, map[string]any{"data": out})
		return true
	}
	var profile struct {
		Currency string
		Company  struct{ SectorName *string }
	}
	if json.Unmarshal(raw, &profile) != nil {
		failure(w, 503, "Invalid peer profile")
		return true
	}
	instruments, e := store.Instruments(ctx, exchange)
	if e != nil {
		failure(w, 503, "Peer universe unavailable")
		return true
	}
	for _, raw := range instruments {
		var p struct {
			Symbol, SecurityID, CompanyName, Currency string
			Sector                                    *string
		}
		if json.Unmarshal(raw, &p) != nil {
			failure(w, 503, "Invalid peer universe")
			return true
		}
		sameSector := p.Sector == nil && profile.Company.SectorName == nil
		if p.Sector != nil && profile.Company.SectorName != nil {
			sameSector = *p.Sector == *profile.Company.SectorName
		}
		if !sameSector || p.Currency != profile.Currency || p.Symbol == symbol {
			continue
		}
		ratios, e := store.Ratios(ctx, p.SecurityID)
		if e != nil {
			ratios = nil
		}
		history, e := store.FinancialHistory(ctx, p.SecurityID, "annual", 2)
		if e != nil {
			history = []json.RawMessage{}
		}
		sector := ""
		if p.Sector != nil {
			sector = *p.Sector
		}
		financial, e := s.Engine.Calculate(ctx, engine.Request{Operation: "analyze_financials", Args: []any{history, sector}})
		if e != nil {
			failure(w, 503, "Peer calculation unavailable")
			return true
		}
		var analysis struct {
			Period  json.RawMessage
			Metrics json.RawMessage
		}
		if json.Unmarshal(financial, &analysis) != nil {
			failure(w, 503, "Invalid peer calculation")
			return true
		}
		out = append(out, map[string]any{"symbol": p.Symbol, "name": p.CompanyName, "sector": p.Sector, "currency": p.Currency, "period": analysis.Period, "ratios": ratios, "metrics": analysis.Metrics})
		if len(out) == 5 {
			break
		}
	}
	respond(w, 200, map[string]any{"data": out})
	return true
}
