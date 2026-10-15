package ingestion

import (
	"context"
	"continua/backend/internal/engine"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"time"
)

type FundamentalsBundle struct {
	Security marketdata.SecurityInput        `json:"security"`
	Company  marketdata.CompanyInput         `json:"company"`
	Sector   marketdata.SectorInput          `json:"sector"`
	Period   marketdata.FinancialPeriodInput `json:"period"`
	Income   json.RawMessage                 `json:"income"`
	Balance  json.RawMessage                 `json:"balance"`
	CashFlow json.RawMessage                 `json:"cashFlow"`
}

type FundamentalsStore interface {
	AuditStore
	UpsertSector(context.Context, marketdata.SectorInput) error
	ResolveSector(context.Context, marketdata.SectorInput) (marketdata.SectorInput, error)
	UpsertCompany(context.Context, marketdata.CompanyInput) error
	UpsertSecurity(context.Context, marketdata.SecurityInput) error
	UpsertPeriodBundle(context.Context, marketdata.FinancialPeriodInput, json.RawMessage, json.RawMessage, json.RawMessage, time.Time) error
}

type FundamentalsPipeline struct {
	Store               FundamentalsStore
	Worker              Calculator
	History             func(context.Context, string) ([]FundamentalsBundle, error)
	Latest              func(context.Context, string) (*FundamentalsBundle, error)
	AfterSecurityCommit func(context.Context, marketdata.SecurityInput) error
}

func (p *FundamentalsPipeline) Run(ctx context.Context, symbols []string) (int, error) {
	if p.Store == nil || p.Worker == nil {
		return 0, errors.New("fundamentals pipeline configuration required")
	}
	now := time.Now().UTC()
	audit := newRunAudit(p.Store, "financials", now)
	stored := 0
	collection, err := CollectFundamentals(ctx, symbols, p.History, p.Latest)
	if err != nil {
		return stored, audit.finish(ctx, stored, err)
	}
	for _, failure := range collection.Failures {
		if err := audit.failure(ctx, "financials", "collection-failed", &failure.Symbol, map[string]any{"symbol": failure.Symbol}); err != nil {
			return stored, audit.finish(ctx, stored, err)
		}
	}
	if len(collection.Records) > 10000 {
		return stored, audit.finish(ctx, stored, errors.Join(errors.New("fundamentals history budget"), audit.failure(ctx, "financials", "record-too-large", nil, nil)))
	}
	changed := []marketdata.SecurityInput{}
	seen := map[string]bool{}
	for _, bundle := range collection.Records {
		if err := ctx.Err(); err != nil {
			return stored, audit.finish(ctx, stored, err)
		}
		raw, err := p.Worker.Calculate(ctx, engine.Request{Operation: "normalize_fundamentals_bundle", Args: []any{bundle}})
		var normalized FundamentalsBundle
		if err != nil || json.Unmarshal(raw, &normalized) != nil {
			if err := audit.failure(ctx, "financials", "normalization-failed", &bundle.Security.Symbol, bundle); err != nil {
				return stored, audit.finish(ctx, stored, err)
			}
			continue
		}
		if normalized.Security.Exchange != "NSE" || normalized.Security.CompanyID != normalized.Company.ID || normalized.Period.SecurityID != normalized.Security.ID || normalized.Company.SectorID == nil || *normalized.Company.SectorID != normalized.Sector.ID {
			if err := audit.failure(ctx, "financials", "validation-failed", &bundle.Security.Symbol, bundle); err != nil {
				return stored, audit.finish(ctx, stored, err)
			}
			continue
		}
		var sector marketdata.SectorInput
		sector, err = p.Store.ResolveSector(ctx, normalized.Sector)
		if err == nil {
			normalized.Company.SectorID = &sector.ID
		}
		if err == nil {
			err = p.Store.UpsertCompany(ctx, normalized.Company)
		}
		if err == nil {
			err = p.Store.UpsertSecurity(ctx, normalized.Security)
		}
		if err == nil {
			err = p.Store.UpsertPeriodBundle(ctx, normalized.Period, normalized.Income, normalized.Balance, normalized.CashFlow, now)
		}
		if err != nil {
			if err := audit.failure(ctx, "financials", "persistence-failed", &bundle.Security.Symbol, bundle); err != nil {
				return stored, audit.finish(ctx, stored, err)
			}
			continue
		}
		stored++
		if !seen[normalized.Security.ID] {
			seen[normalized.Security.ID] = true
			changed = append(changed, normalized.Security)
		}
	}
	// Historical periods are persisted first; never recompute per old filing.
	if p.AfterSecurityCommit != nil {
		for _, security := range changed {
			if err := p.AfterSecurityCommit(ctx, security); err != nil {
				if err := audit.failure(ctx, "financials", "publication-failed", &security.Symbol, map[string]any{"securityId": security.ID}); err != nil {
					return stored, audit.finish(ctx, stored, err)
				}
			}
		}
	}
	return stored, audit.finish(ctx, stored, nil)
}
