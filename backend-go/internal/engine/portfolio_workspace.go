package engine

import (
	"context"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"time"
)

type PortfolioWorkspace struct {
	Store    *marketdata.Store
	Worker   CalculationWorker
	Assembly CalculationWorker
	Bundles  interface {
		Bundle(context.Context, string, string) (json.RawMessage, error)
	}
	Now   func() time.Time
	slots chan struct{}
}

func NewPortfolioWorkspace(store *marketdata.Store, worker, assembly CalculationWorker, bundles interface {
	Bundle(context.Context, string, string) (json.RawMessage, error)
}) *PortfolioWorkspace {
	return &PortfolioWorkspace{Store: store, Worker: worker, Assembly: assembly, Bundles: bundles, Now: time.Now, slots: make(chan struct{}, 2)}
}
func (s *PortfolioWorkspace) Research(ctx context.Context, owner, exchange string) (json.RawMessage, error) {
	if owner == "" || exchange != "NSE" || s.Store == nil || s.Worker == nil || s.Assembly == nil || s.Bundles == nil {
		return nil, errors.New("native portfolio research unavailable")
	}
	select {
	case s.slots <- struct{}{}:
		defer func() { <-s.slots }()
	default:
		return nil, ErrBundleCapacity
	}
	positions, e := s.Store.PortfolioPositions(ctx, owner, exchange)
	if e != nil {
		return nil, e
	}
	now := s.Now().UTC()
	stamp := now.Format(time.RFC3339Nano)
	raw, e := s.Worker.Calculate(ctx, Request{Operation: "snapshot_plan", Args: []any{positions, stamp}})
	if e != nil {
		return nil, e
	}
	var plan struct {
		Complete        bool
		Currency        string
		SessionDate     string
		TotalValue      float64
		SelectedSymbols []string
	}
	if json.Unmarshal(raw, &plan) != nil {
		return nil, errors.New("invalid snapshot plan")
	}
	persistenceCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	available := true
	if plan.Complete {
		if e = s.Store.SavePortfolioSnapshot(persistenceCtx, owner, exchange, plan.Currency, plan.SessionDate, plan.TotalValue, positions); e != nil {
			available = false
		}
	}
	persisted, e := s.Store.PortfolioPersistence(persistenceCtx, owner, exchange)
	if e != nil {
		available = false
		persisted = map[string][]json.RawMessage{}
	}
	cancel()
	histories := []map[string]any{}
	dividends := []map[string]any{}
	priced := 0
	for _, raw := range positions {
		var p struct {
			Symbol string
			Price  *float64
		}
		if json.Unmarshal(raw, &p) != nil {
			return nil, errors.New("invalid owned position")
		}
		if p.Price == nil {
			continue
		}
		priced++
		if priced <= 10 {
			bars, be := s.Store.Candles(ctx, "NSE:"+p.Symbol, "1d", now.Add(-365*24*time.Hour), now)
			actions, ae := s.Store.CorporateActions(ctx, "NSE:"+p.Symbol)
			blocked := false
			if be != nil || ae != nil {
				bars = []json.RawMessage{}
			}
			for _, raw := range actions {
				var a struct {
					Type, Status          string
					EffectiveDate, ExDate *string
				}
				if json.Unmarshal(raw, &a) != nil {
					return nil, errors.New("invalid action evidence")
				}
				date := a.EffectiveDate
				if date == nil {
					date = a.ExDate
				}
				if (a.Type == "split" || a.Type == "bonus_issue") && a.Status != "cancelled" && date != nil && *date >= now.Add(-365*24*time.Hour).Format("2006-01-02") {
					blocked = true
					bars = []json.RawMessage{}
				}
			}
			histories = append(histories, map[string]any{"symbol": p.Symbol, "bars": bars, "blocked": blocked})
		}
		if priced <= 20 {
			actions, e := s.Store.Dividends(ctx, "NSE:"+p.Symbol)
			if e != nil {
				actions = []json.RawMessage{}
			}
			dividends = append(dividends, map[string]any{"symbol": p.Symbol, "actions": actions})
		}
	}
	companies := map[string]json.RawMessage{}
	companyRows, e := BoundedResearch(ctx, plan.SelectedSymbols, func(bundleCtx context.Context, symbol string) (json.RawMessage, error) {
		bundle, e := s.Bundles.Bundle(bundleCtx, symbol, exchange)
		if e != nil {
			return nil, e
		}
		var fields map[string]json.RawMessage
		if json.Unmarshal(bundle, &fields) != nil {
			return nil, errors.New("invalid optional company research")
		}
		projection := map[string]json.RawMessage{}
		for _, key := range []string{"financialAnalysis", "briefing", "quality", "changes", "unavailable", "news"} {
			if fields[key] != nil {
				projection[key] = fields[key]
			}
		}
		return json.Marshal(projection)
	}, ResearchBudget{Duration: 8 * time.Second, Concurrency: 3})
	if e != nil {
		return nil, e
	}
	for index, raw := range companyRows {
		if raw != nil {
			companies[plan.SelectedSymbols[index]] = raw
		}
	}
	data := map[string]any{"positions": positions, "histories": histories, "dividends": dividends, "companies": companies, "persistenceAvailable": available, "snapshots": persisted["snapshots"], "flows": persisted["flows"], "periodFlows": persisted["periodFlows"]}
	for _, key := range []string{"snapshots", "flows", "periodFlows"} {
		if persisted[key] == nil {
			data[key] = []json.RawMessage{}
		}
	}
	return s.Assembly.Calculate(ctx, Request{Operation: "portfolio_workspace", Args: []any{data, stamp}})
}
