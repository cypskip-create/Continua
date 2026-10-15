package ingestion

import (
	"context"
	"continua/backend/internal/engine"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Transport implementations own source rights, DNS/TLS policy, immutable raw
// evidence and literal-field availability. There is no synthetic fallback.
type NSETransport interface {
	Securities(context.Context) ([]json.RawMessage, error)
	Quotes(context.Context, []string) ([]json.RawMessage, error)
	Candles(context.Context, string, string, time.Time, time.Time) ([]json.RawMessage, error)
	CompanyProfile(context.Context, string) (json.RawMessage, error)
	Financials(context.Context, string) ([]json.RawMessage, error)
	CorporateActions(context.Context, *string) ([]json.RawMessage, error)
	EarningsEvents(context.Context, *string) ([]json.RawMessage, error)
	Ownership(context.Context, string) ([]json.RawMessage, error)
}

type NSEListing struct {
	Security marketdata.SecurityInput `json:"security"`
	Company  marketdata.CompanyInput  `json:"company"`
	Sector   marketdata.SectorInput   `json:"sector"`
}

type NSEAdapter struct {
	Transport NSETransport
	Worker    Calculator
}

func nativeMapBatch[T any](ctx context.Context, a *NSEAdapter, kind string, raw []json.RawMessage) ([]T, error) {
	if a == nil || a.Worker == nil || a.Transport == nil || len(raw) > 10000 {
		return nil, errors.New("native NSE adapter configuration or batch invalid")
	}
	if len(raw) == 0 {
		return []T{}, nil
	}
	output, err := a.Worker.Calculate(ctx, engine.Request{Operation: "map_nse_batch", Args: []any{kind, raw}})
	if err != nil {
		return nil, err
	}
	var result []T
	if json.Unmarshal(output, &result) != nil || len(result) != len(raw) {
		return nil, errors.New("native NSE mapping response invalid")
	}
	return result, nil
}

func (a *NSEAdapter) ListSecurities(ctx context.Context) ([]marketdata.SecurityInput, error) {
	if a == nil || a.Transport == nil {
		return nil, errors.New("native NSE transport missing")
	}
	raw, err := a.Transport.Securities(ctx)
	if err != nil {
		return nil, err
	}
	return nativeMapBatch[marketdata.SecurityInput](ctx, a, "security", raw)
}
func (a *NSEAdapter) Listings(ctx context.Context) ([]NSEListing, error) {
	if a == nil || a.Transport == nil {
		return nil, errors.New("native NSE transport missing")
	}
	raw, err := a.Transport.Securities(ctx)
	if err != nil {
		return nil, err
	}
	return nativeMapBatch[NSEListing](ctx, a, "listing", raw)
}
func (a *NSEAdapter) Quotes(ctx context.Context, symbols []string) ([]marketdata.QuoteInput, error) {
	if a == nil || a.Transport == nil {
		return nil, errors.New("native NSE transport missing")
	}
	raw, err := a.Transport.Quotes(ctx, append([]string{}, symbols...))
	if err != nil {
		return nil, err
	}
	return nativeMapBatch[marketdata.QuoteInput](ctx, a, "quote", raw)
}
func (a *NSEAdapter) Candles(ctx context.Context, symbol, interval string, from, to time.Time) ([]marketdata.CandleInput, error) {
	if a == nil || a.Transport == nil {
		return nil, errors.New("native NSE transport missing")
	}
	intervals := map[string]string{"1m": "1MIN", "5m": "5MIN", "15m": "15MIN", "1h": "1HR", "1d": "1D", "1w": "1W", "1M": "1MO", "1y": "1Y"}
	if intervals[interval] == "" || from.After(to) {
		return nil, errors.New("invalid candle collection window")
	}
	raw, err := a.Transport.Candles(ctx, symbol, intervals[interval], from, to)
	if err != nil {
		return nil, err
	}
	return nativeMapBatch[marketdata.CandleInput](ctx, a, "candle", raw)
}
func (a *NSEAdapter) FundamentalsHistory(ctx context.Context, symbol string) ([]FundamentalsBundle, error) {
	if a == nil || a.Transport == nil || a.Worker == nil {
		return nil, errors.New("native NSE adapter missing")
	}
	securities, err := a.Transport.Securities(ctx)
	if err != nil {
		return nil, err
	}
	profile, err := a.Transport.CompanyProfile(ctx, symbol)
	if err != nil {
		return nil, err
	}
	periods, err := a.Transport.Financials(ctx, symbol)
	if err != nil {
		return nil, err
	}
	if len(securities) > 1000 || len(periods) > 1000 {
		return nil, errors.New("NSE fundamentals response budget")
	}
	if len(profile) == 0 {
		profile = json.RawMessage(`null`)
	}
	raw, err := a.Worker.Calculate(ctx, engine.Request{Operation: "map_nse_fundamentals", Args: []any{securities, profile, periods, symbol}})
	if err != nil {
		return nil, err
	}
	var result []FundamentalsBundle
	if json.Unmarshal(raw, &result) != nil || len(result) > 1000 {
		return nil, errors.New("invalid NSE fundamentals mapping")
	}
	return result, nil
}
func (a *NSEAdapter) LatestFundamentals(ctx context.Context, symbol string) (*FundamentalsBundle, error) {
	history, err := a.FundamentalsHistory(ctx, symbol)
	if err != nil || len(history) == 0 {
		return nil, err
	}
	return &history[len(history)-1], nil
}
func (a *NSEAdapter) CorporateActions(ctx context.Context, since *string) ([]marketdata.CorporateAction, error) {
	if a == nil || a.Transport == nil {
		return nil, errors.New("native NSE transport missing")
	}
	raw, err := a.Transport.CorporateActions(ctx, since)
	if err != nil {
		return nil, err
	}
	return nativeMapBatch[marketdata.CorporateAction](ctx, a, "action", raw)
}
func (a *NSEAdapter) EarningsEvents(ctx context.Context, since *string) ([]marketdata.EarningsEvent, error) {
	if a == nil || a.Transport == nil {
		return nil, errors.New("native NSE transport missing")
	}
	raw, err := a.Transport.EarningsEvents(ctx, since)
	if err != nil {
		return nil, err
	}
	return nativeMapBatch[marketdata.EarningsEvent](ctx, a, "earnings", raw)
}
func (a *NSEAdapter) Ownership(ctx context.Context, symbol string) ([]marketdata.OwnershipRecord, error) {
	if a == nil || a.Transport == nil {
		return nil, errors.New("native NSE transport missing")
	}
	raw, err := a.Transport.Ownership(ctx, symbol)
	if err != nil {
		return nil, err
	}
	return nativeMapBatch[marketdata.OwnershipRecord](ctx, a, "ownership", raw)
}

type AdapterRegistry struct{ NSE *NSEAdapter }

func (r *AdapterRegistry) Get(exchange string) (*NSEAdapter, error) {
	if exchange != "NSE" || strings.TrimSpace(exchange) != exchange {
		return nil, errors.New("unsupported exchange: Continua covers NSE only")
	}
	if r == nil || r.NSE == nil {
		return nil, errors.New("native NSE adapter not configured")
	}
	return r.NSE, nil
}
func (r *AdapterRegistry) All() []*NSEAdapter {
	if r == nil || r.NSE == nil {
		return []*NSEAdapter{}
	}
	return []*NSEAdapter{r.NSE}
}
