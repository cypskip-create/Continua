package ingestion

import (
	"context"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"time"
)

type QuotePipelineStore interface {
	PublishedQuoteInputs(context.Context) ([]marketdata.QuoteInput, error)
	UpsertQuotesBatch(context.Context, []marketdata.QuoteInput, time.Time) ([]json.RawMessage, error)
	RecordDeadLetter(context.Context, marketdata.DeadLetter) error
	RecordIngestionRun(context.Context, marketdata.IngestionRun) error
}
type QuotePipeline struct {
	Store       QuotePipelineStore
	AfterCommit func(context.Context, []json.RawMessage) error
	Now         func() time.Time
}
type QuoteSummary struct{ Accepted, Changed, Rejected int }

func (p *QuotePipeline) Run(ctx context.Context) (QuoteSummary, error) {
	summary := QuoteSummary{}
	if p.Store == nil {
		return summary, errors.New("quote pipeline store required")
	}
	now := time.Now().UTC()
	if p.Now != nil {
		now = p.Now().UTC()
	}
	audit := marketdata.IngestionRun{Exchange: "NSE", Dataset: "price", Status: "success", StartedAt: now}
	fail := func(code string, payload json.RawMessage, symbol *string) error {
		audit.ErrorCount++
		if len(audit.Errors) < 20 {
			audit.Errors = append(audit.Errors, code)
		}
		return p.Store.RecordDeadLetter(ctx, marketdata.DeadLetter{Exchange: "NSE", Dataset: "price", Symbol: symbol, Payload: payload, ErrorCode: code})
	}
	finish := func(cause error) (QuoteSummary, error) {
		audit.RecordCount = summary.Accepted
		if audit.ErrorCount > 0 {
			audit.Status = "failed"
			if summary.Accepted > 0 {
				audit.Status = "partial"
			}
		}
		audit.FinishedAt = time.Now().UTC()
		if p.Now != nil {
			audit.FinishedAt = p.Now().UTC()
		}
		return summary, errors.Join(cause, p.Store.RecordIngestionRun(ctx, audit))
	}
	quotes, err := p.Store.PublishedQuoteInputs(ctx)
	if err != nil {
		return finish(errors.Join(errors.New("quote source collection failed"), fail("collection-failed", json.RawMessage(`{}`), nil)))
	}
	if len(quotes) > 500 {
		return finish(errors.Join(errors.New("quote universe budget exceeded"), fail("record-too-large", json.RawMessage(`{}`), nil)))
	}
	// No changed source evidence means no polling audit write every 30 seconds.
	if len(quotes) == 0 {
		return summary, nil
	}
	valid := []marketdata.QuoteInput{}
	seen := map[string]bool{}
	for _, quote := range quotes {
		if quote.Validate(now) != nil || seen[quote.SecurityID] {
			summary.Rejected++
			payload, marshalErr := json.Marshal(quote)
			if marshalErr != nil {
				payload = json.RawMessage(`{"invalidNumericObservation":true}`)
			}
			if err := fail("validation-failed", payload, &quote.Symbol); err != nil {
				return finish(err)
			}
			continue
		}
		seen[quote.SecurityID] = true
		valid = append(valid, quote)
	}
	if len(valid) == 0 {
		return finish(nil)
	}
	changed, err := p.Store.UpsertQuotesBatch(ctx, valid, now)
	if err != nil {
		return finish(errors.Join(errors.New("quote persistence failed"), fail("persistence-failed", json.RawMessage(`{}`), nil)))
	}
	summary.Accepted = len(valid)
	summary.Changed = len(changed)
	if len(changed) > 0 && p.AfterCommit != nil {
		if err = p.AfterCommit(ctx, changed); err != nil {
			return finish(errors.Join(errors.New("committed quote delivery failed"), fail("publication-failed", json.RawMessage(`{}`), nil)))
		}
	}
	return finish(nil)
}
