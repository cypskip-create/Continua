package ingestion

import (
	"context"
	"continua/backend/internal/engine"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"time"
)

type CandleStore interface {
	AuditStore
	UpsertCandlesBatch(context.Context, []marketdata.CandleInput, time.Time) error
	Candles(context.Context, string, string, time.Time, time.Time) ([]json.RawMessage, error)
}

type CandlePipeline struct {
	Store  CandleStore
	Worker Calculator
	Fetch  func(context.Context, string, string, time.Time, time.Time) ([]marketdata.CandleInput, error)
}

type CandleSummary struct{ Stored, Rejected, Duplicates int }

func (p *CandlePipeline) Run(ctx context.Context, symbols []string, days int) (CandleSummary, error) {
	summary := CandleSummary{}
	if p.Store == nil || p.Worker == nil || p.Fetch == nil || len(symbols) > 1000 || days < 1 || days > 36500 {
		return summary, errors.New("invalid daily candle collection")
	}
	to := time.Now().UTC()
	from := to.Add(-time.Duration(days) * 24 * time.Hour)
	audit := newRunAudit(p.Store, "candle", to)
	failure := func(symbol, code string, payload any) error {
		return audit.failure(ctx, "candle", code, &symbol, payload)
	}
	for _, symbol := range symbols {
		if err := ctx.Err(); err != nil {
			return summary, audit.finish(ctx, summary.Stored, err)
		}
		raw, err := Retry(ctx, DefaultRetryOptions(), func(ctx context.Context) ([]marketdata.CandleInput, error) {
			return p.Fetch(ctx, symbol, "1d", from, to)
		})
		if err != nil {
			if err := failure(symbol, "collection-failed", map[string]any{"symbol": symbol, "days": days}); err != nil {
				return summary, audit.finish(ctx, summary.Stored, err)
			}
			continue
		}
		if len(raw) > 10000 {
			if err := failure(symbol, "record-too-large", map[string]any{"symbol": symbol, "days": days}); err != nil {
				return summary, audit.finish(ctx, summary.Stored, err)
			}
			continue
		}
		daily := []marketdata.CandleInput{}
		seen := map[string]bool{}
		bad := 0
		earliest := to
		for _, bar := range raw {
			at, parseErr := time.Parse(time.RFC3339Nano, bar.Timestamp)
			if bar.Validate(to) != nil || parseErr != nil || bar.SecurityID != "NSE:"+symbol || bar.Interval != "1d" || at.Before(from) {
				bad++
				continue
			}
			key := at.UTC().Format(time.RFC3339Nano)
			if seen[key] {
				summary.Duplicates++
				continue
			}
			seen[key] = true
			daily = append(daily, bar)
			if at.Before(earliest) {
				earliest = at
			}
		}
		summary.Rejected += bad
		if bad > 0 {
			if err := failure(symbol, "validation-failed", map[string]any{"symbol": symbol, "rejected": bad}); err != nil {
				return summary, audit.finish(ctx, summary.Stored, err)
			}
		}
		if len(daily) == 0 {
			continue
		}
		if err := p.Store.UpsertCandlesBatch(ctx, daily, to); err != nil {
			if err := failure(symbol, "persistence-failed", map[string]any{"symbol": symbol, "interval": "1d"}); err != nil {
				return summary, audit.finish(ctx, summary.Stored, err)
			}
			continue
		}
		summary.Stored += len(daily)
		// Rebuild touched buckets from stored daily history, not a short top-up.
		start := time.Date(earliest.UTC().Year(), 1, 1, 0, 0, 0, 0, time.UTC).Add(-7 * 24 * time.Hour)
		history, err := p.Store.Candles(ctx, "NSE:"+symbol, "1d", start, to)
		if err != nil {
			if err := failure(symbol, "source-unavailable", map[string]any{"symbol": symbol, "stage": "stored-history"}); err != nil {
				return summary, audit.finish(ctx, summary.Stored, err)
			}
			continue
		}
		derivedRaw, err := p.Worker.Calculate(ctx, engine.Request{Operation: "aggregate_touched_candles", Args: []any{daily, history}})
		var derived []marketdata.CandleInput
		if err != nil || json.Unmarshal(derivedRaw, &derived) != nil || len(derived) > 10000 {
			if err := failure(symbol, "normalization-failed", map[string]any{"symbol": symbol, "stage": "aggregation"}); err != nil {
				return summary, audit.finish(ctx, summary.Stored, err)
			}
			continue
		}
		valid := true
		for _, bar := range derived {
			if bar.SecurityID != "NSE:"+symbol || (bar.Interval != "1w" && bar.Interval != "1M" && bar.Interval != "1y") || bar.Validate(to) != nil {
				valid = false
				break
			}
		}
		if !valid {
			if err := failure(symbol, "validation-failed", map[string]any{"symbol": symbol, "stage": "aggregate-provenance"}); err != nil {
				return summary, audit.finish(ctx, summary.Stored, err)
			}
			continue
		}
		if err := p.Store.UpsertCandlesBatch(ctx, derived, to); err != nil {
			if err := failure(symbol, "persistence-failed", map[string]any{"symbol": symbol, "stage": "aggregate-write"}); err != nil {
				return summary, audit.finish(ctx, summary.Stored, err)
			}
		} else {
			summary.Stored += len(derived)
		}
	}
	return summary, audit.finish(ctx, summary.Stored, nil)
}
