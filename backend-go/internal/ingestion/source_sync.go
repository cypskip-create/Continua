package ingestion

import (
	"context"
	"continua/backend/internal/engine"
	"continua/backend/internal/jobs"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"
)

type SourceSyncStore interface {
	FundamentalsStore
	CorporateStore
	CandleStore
	RegisteredSecurity(context.Context, string, string) (*marketdata.SecurityInput, error)
}

var sourceSymbol = regexp.MustCompile(`^[A-Z0-9][A-Z0-9.-]{0,19}$`)

type SourceSync struct {
	Store               SourceSyncStore
	Adapter             *NSEAdapter
	Worker              Calculator
	TradingDay          func(time.Time) bool
	MarketOpen          func(time.Time) bool
	AfterSecurityCommit func(context.Context, marketdata.SecurityInput) error
	AfterActionCommit   func(context.Context, marketdata.CorporateAction) error
}

// Bootstrap uses source-observed status/identity only. It does not import mock
// seed prices, assumed 1990 listing dates or placeholder company officers.
func (s *SourceSync) Bootstrap(ctx context.Context) (int, error) {
	if s.Store == nil || s.Adapter == nil || s.Worker == nil {
		return 0, errors.New("native source synchronization configuration missing")
	}
	audit := newRunAudit(s.Store, "company", time.Now())
	stored := 0
	listings, err := Retry(ctx, DefaultRetryOptions(), s.Adapter.Listings)
	if err != nil {
		return stored, audit.finish(ctx, stored, errors.New("native issuer directory unavailable"))
	}
	if len(listings) > 1000 {
		return stored, audit.finish(ctx, stored, errors.New("issuer directory budget exceeded"))
	}
	seen := map[string]bool{}
	for _, listing := range listings {
		if err := ctx.Err(); err != nil {
			return stored, audit.finish(ctx, stored, err)
		}
		if seen[listing.Security.ID] {
			continue
		}
		seen[listing.Security.ID] = true
		// Existing registrations need no profile fields from a sparse directory.
		// In particular, never overwrite a delisted registration during bootstrap.
		if listing.Security.Exchange != "NSE" || !sourceSymbol.MatchString(listing.Security.Symbol) || listing.Security.ID != "NSE:"+listing.Security.Symbol {
			audit.run.ErrorCount++
			if len(audit.run.Errors) < 20 {
				audit.run.Errors = append(audit.run.Errors, "validation-failed")
			}
			continue
		}
		existing, lookupErr := s.Store.RegisteredSecurity(ctx, "NSE", listing.Security.Symbol)
		if lookupErr != nil {
			return stored, audit.finish(ctx, stored, errors.New("existing issuer lookup unavailable"))
		}
		if existing != nil {
			continue
		}
		companyRaw, err := s.Worker.Calculate(ctx, engine.Request{Operation: "normalize_feed", Args: []any{"company", listing.Company}})
		if err == nil {
			err = json.Unmarshal(companyRaw, &listing.Company)
		}
		securityRaw, securityErr := s.Worker.Calculate(ctx, engine.Request{Operation: "normalize_feed", Args: []any{"security", listing.Security}})
		if securityErr == nil {
			securityErr = json.Unmarshal(securityRaw, &listing.Security)
		}
		if err != nil || securityErr != nil || listing.Security.ID != "NSE:"+listing.Security.Symbol || listing.Security.CompanyID != listing.Company.ID || listing.Company.ID != "NSE:company:"+listing.Security.Symbol || strings.TrimSpace(listing.Company.Name) == "" || strings.TrimSpace(listing.Sector.Name) == "" || listing.Company.SectorID == nil || *listing.Company.SectorID != listing.Sector.ID {
			// The deployed dead-letter DDL has no company dataset. Keep its
			// failure count private in the run, rather than inventing a row type.
			audit.run.ErrorCount++
			if len(audit.run.Errors) < 20 {
				audit.run.Errors = append(audit.run.Errors, "validation-failed")
			}
			continue
		}
		sector, err := s.Store.ResolveSector(ctx, listing.Sector)
		if err == nil {
			listing.Company.SectorID = &sector.ID
			err = s.Store.UpsertCompany(ctx, listing.Company)
		}
		if err == nil {
			err = s.Store.UpsertSecurity(ctx, listing.Security)
		}
		if err != nil {
			audit.run.ErrorCount++
			if len(audit.run.Errors) < 20 {
				audit.run.Errors = append(audit.run.Errors, "persistence-failed")
			}
			continue
		}
		stored++
	}
	return stored, audit.finish(ctx, stored, nil)
}

func (s *SourceSync) symbols(ctx context.Context) ([]string, error) {
	if s.Adapter == nil {
		return nil, errors.New("native NSE adapter unavailable")
	}
	securities, err := Retry(ctx, DefaultRetryOptions(), s.Adapter.ListSecurities)
	if err != nil {
		return nil, err
	}
	if len(securities) > 1000 {
		return nil, errors.New("issuer directory budget exceeded")
	}
	result := []string{}
	seen := map[string]bool{}
	for _, security := range securities {
		if security.Exchange != "NSE" || !sourceSymbol.MatchString(security.Symbol) || security.ID != "NSE:"+security.Symbol || security.Currency != "KES" || !map[string]bool{"active": true, "suspended": true, "halted": true, "delisted": true}[security.Status] {
			return nil, errors.New("invalid source issuer identity or status")
		}
		if security.Status == "delisted" || seen[security.Symbol] {
			continue
		}
		seen[security.Symbol] = true
		result = append(result, security.Symbol)
	}
	return result, nil
}

func (s *SourceSync) Fundamentals(ctx context.Context) error {
	symbols, err := s.symbols(ctx)
	if err != nil {
		return err
	}
	pipeline := FundamentalsPipeline{Store: s.Store, Worker: s.Worker, History: s.Adapter.FundamentalsHistory, AfterSecurityCommit: s.AfterSecurityCommit}
	_, err = pipeline.Run(ctx, symbols)
	return err
}
func (s *SourceSync) Corporate(ctx context.Context) error {
	symbols, err := s.symbols(ctx)
	if err != nil {
		return err
	}
	since := time.Now().UTC().Add(-7 * 24 * time.Hour).Format(time.RFC3339Nano)
	pipeline := CorporatePipeline{Store: s.Store, Source: s.Adapter, AfterActionCommit: s.AfterActionCommit}
	_, err = pipeline.Run(ctx, &since, symbols)
	return err
}
func (s *SourceSync) Candles(ctx context.Context, backfill bool) error {
	if !backfill {
		if s.TradingDay == nil {
			return errors.New("source candle trading calendar is not configured")
		}
		if !s.TradingDay(time.Now().UTC()) {
			return nil
		}
	}
	symbols, err := s.symbols(ctx)
	if err != nil {
		return err
	}
	days := 5
	if backfill {
		days = 3600
	}
	pipeline := CandlePipeline{Store: s.Store, Worker: s.Worker, Fetch: s.Adapter.Candles}
	_, err = pipeline.Run(ctx, symbols, days)
	return err
}

type SourceSchedules struct{ Fundamentals, Corporate string }

func (s *SourceSync) Register(runner *jobs.Runner, schedules SourceSchedules) error {
	if runner == nil || s.Store == nil || s.Adapter == nil || s.Worker == nil {
		return errors.New("source job configuration missing")
	}
	if schedules.Fundamentals == "" || schedules.Corporate == "" {
		return errors.New("explicit source schedules required")
	}
	if requester, ok := s.Adapter.Transport.(interface{ RequestQuoteRefresh(context.Context) error }); ok {
		if s.MarketOpen == nil {
			return errors.New("quote collection trading calendar is required")
		}
		if err := runner.Add(jobs.Job{Name: "source-price-request", Schedule: "*/5 * * * *", Timeout: 15 * time.Second, Cooldown: 5 * time.Minute, Run: func(ctx context.Context) error {
			if !s.MarketOpen(time.Now().UTC()) {
				return nil
			}
			return requester.RequestQuoteRefresh(ctx)
		}}); err != nil {
			return err
		}
	}
	for _, job := range []jobs.Job{
		{Name: "source-fundamentals", Schedule: schedules.Fundamentals, Timeout: 30 * time.Minute, Cooldown: time.Minute, Run: s.Fundamentals},
		{Name: "source-corporate", Schedule: schedules.Corporate, Timeout: 30 * time.Minute, Cooldown: time.Minute, Run: s.Corporate},
		// Kenya has no DST: 16:30 Africa/Nairobi is 13:30 UTC.
		{Name: "source-candle-topup", Schedule: "30 13 * * 1-5", Timeout: 30 * time.Minute, Cooldown: time.Minute, Run: func(ctx context.Context) error { return s.Candles(ctx, false) }},
	} {
		if err := runner.Add(job); err != nil {
			return err
		}
	}
	return nil
}
