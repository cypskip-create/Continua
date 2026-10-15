package engine

import (
	"context"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"time"
)

type NativeInputs struct {
	Store  *marketdata.Store
	Worker CalculationWorker
	News   *NewsReader
	Now    func() time.Time
}

func (n *NativeInputs) now() time.Time {
	if n.Now != nil {
		return n.Now().UTC()
	}
	return time.Now().UTC()
}
func (n *NativeInputs) Profile(ctx context.Context, exchange, symbol string) (json.RawMessage, error) {
	return n.Store.CompanyProfile(ctx, exchange, symbol)
}
func (n *NativeInputs) quote(ctx context.Context, exchange, symbol string) (json.RawMessage, error) {
	rows, err := n.Store.Quotes(ctx, exchange, []string{symbol})
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return json.RawMessage(`null`), nil
	}
	return rows[0], nil
}
func (n *NativeInputs) Section(ctx context.Context, name, id, exchange, symbol string) (json.RawMessage, error) {
	var rows []json.RawMessage
	var err error
	switch name {
	case "quote":
		return n.quote(ctx, exchange, symbol)
	case "history":
		rows, err = n.Store.FinancialHistory(ctx, id, "annual", 10)
	case "quarterly":
		rows, err = n.Store.FinancialHistory(ctx, id, "quarterly", 12)
	case "earnings":
		rows, err = n.Store.Earnings(ctx, id, 12)
	case "ownership":
		rows, err = n.Store.Ownership(ctx, id)
	case "actions":
		rows, err = n.Store.CorporateActions(ctx, id)
	case "news":
		if n.News == nil {
			return nil, errors.New("native news reader unavailable")
		}
		rows, err = n.News.List(ctx, &id, nil, 12)
	case "technicals":
		if n.Worker == nil {
			return nil, errors.New("native technical worker unavailable")
		}
		now := n.now()
		to := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		from := to.Add(-400 * 24 * time.Hour)
		rows, err = n.Store.Candles(ctx, id, "1d", from, to)
		if err != nil {
			return nil, err
		}
		return n.Worker.Calculate(ctx, Request{Operation: "technical_results", Args: []any{symbol, exchange, rows, []any{map[string]any{"type": "SMA"}, map[string]any{"type": "RSI"}, map[string]any{"type": "MACD"}}}})
	case "valuation":
		return n.Valuation(ctx, exchange, symbol)
	default:
		return nil, errors.New("unsupported native research input")
	}
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []json.RawMessage{}
	}
	return json.Marshal(rows)
}
func (n *NativeInputs) Article(ctx context.Context, id string) (json.RawMessage, error) {
	if n.News == nil {
		return nil, errors.New("native news reader unavailable")
	}
	return n.News.Article(ctx, id)
}

func (n *NativeInputs) Valuation(ctx context.Context, exchange, symbol string) (json.RawMessage, error) {
	if n.Worker == nil {
		return nil, errors.New("native valuation worker unavailable")
	}
	profile, err := n.Profile(ctx, exchange, symbol)
	if err != nil || profile == nil {
		return nil, err
	}
	var company struct {
		ID      string `json:"id"`
		Company struct {
			SectorID *string `json:"sectorId"`
		} `json:"company"`
	}
	if json.Unmarshal(profile, &company) != nil || company.ID == "" {
		return nil, errors.New("invalid company profile")
	}
	rawQuote, err := n.quote(ctx, exchange, symbol)
	if err != nil {
		return nil, err
	}
	if string(rawQuote) == "null" {
		return nil, nil
	}
	var quote struct {
		Timestamp string `json:"timestamp"`
	}
	if json.Unmarshal(rawQuote, &quote) != nil {
		return nil, errors.New("invalid quote response")
	}
	financials, err := n.Store.LatestFinancials(ctx, company.ID, "annual")
	if err != nil {
		return nil, err
	}
	dividends, err := n.Store.Dividends(ctx, company.ID)
	if err != nil {
		return nil, err
	}
	var latest struct {
		FiscalYear            int `json:"fiscalYear"`
		ReportedAt, PeriodEnd string
	}
	var year *int
	if len(financials) > 0 {
		if json.Unmarshal(financials, &latest) != nil {
			return nil, errors.New("invalid financial response")
		}
		if latest.ReportedAt <= quote.Timestamp[:min(10, len(quote.Timestamp))] && latest.PeriodEnd <= quote.Timestamp[:min(10, len(quote.Timestamp))] {
			year = &latest.FiscalYear
		}
	}
	sector := &marketdata.SectorAverage{}
	if company.Company.SectorID != nil && year != nil {
		sector, err = n.Store.SectorAverage(ctx, exchange, *company.Company.SectorID, company.ID, year)
		if err != nil {
			return nil, err
		}
	}
	return n.Worker.Calculate(ctx, Request{Operation: "valuation_bundle", Args: []any{symbol, exchange, rawQuote, financials, dividends, company.Company.SectorID, sector, n.now().Format("2006-01-02T15:04:05.000Z")}})
}

func (n *NativeInputs) ValuationHistory(ctx context.Context, exchange, symbol, ratio string, years int) (json.RawMessage, error) {
	if n.Worker == nil || years < 1 || years > 10 || !map[string]bool{"pe": true, "pb": true, "ps": true}[ratio] {
		return nil, errors.New("invalid historical valuation request")
	}
	id := exchange + ":" + symbol
	now := n.now()
	from := now.Add(-time.Duration(float64(years) * 365.25 * float64(24*time.Hour)))
	periods, err := n.Store.FinancialHistory(ctx, id, "annual", 50)
	if err != nil {
		return nil, err
	}
	quote, err := n.quote(ctx, exchange, symbol)
	if err != nil {
		return nil, err
	}
	candles, err := n.Store.Candles(ctx, id, "1d", from, now)
	if err != nil {
		return nil, err
	}
	var basis struct {
		Currency *string `json:"currency"`
	}
	if json.Unmarshal(quote, &basis) != nil {
		return nil, errors.New("invalid valuation quote")
	}
	if basis.Currency == nil {
		profile, e := n.Profile(ctx, exchange, symbol)
		if e != nil {
			return nil, e
		}
		if len(profile) > 0 && json.Unmarshal(profile, &basis) != nil {
			return nil, errors.New("invalid valuation currency")
		}
	}
	return n.Worker.Calculate(ctx, Request{Operation: "valuation_history", Args: []any{symbol, periods, quote, candles, ratio, basis.Currency}})
}
