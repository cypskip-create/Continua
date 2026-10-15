package ingestion

import (
	"context"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

type quotePipelineFixture struct {
	quotes                         []marketdata.QuoteInput
	dead                           []marketdata.DeadLetter
	runs                           []marketdata.IngestionRun
	writes                         int
	failRead, failWrite, failAudit bool
	committed                      bool
}

func (f *quotePipelineFixture) PublishedQuoteInputs(context.Context) ([]marketdata.QuoteInput, error) {
	if f.failRead {
		return nil, errors.New("private source error")
	}
	return f.quotes, nil
}
func (f *quotePipelineFixture) UpsertQuotesBatch(_ context.Context, q []marketdata.QuoteInput, _ time.Time) ([]json.RawMessage, error) {
	f.writes++
	if f.failWrite {
		return nil, errors.New("private SQL error")
	}
	f.committed = true
	return []json.RawMessage{json.RawMessage(`{"symbol":"KCB"}`)}, nil
}
func (f *quotePipelineFixture) RecordDeadLetter(_ context.Context, d marketdata.DeadLetter) error {
	f.dead = append(f.dead, d)
	if f.failAudit {
		return errors.New("audit unavailable")
	}
	return nil
}
func (f *quotePipelineFixture) RecordIngestionRun(_ context.Context, r marketdata.IngestionRun) error {
	f.runs = append(f.runs, r)
	return nil
}
func fixturePipelineQuote() marketdata.QuoteInput {
	var q marketdata.QuoteInput
	_ = json.Unmarshal([]byte(`{"securityId":"NSE:KCB","symbol":"KCB","exchange":"NSE","lastPrice":30,"open":29,"high":31,"low":28,"previousClose":29,"change":1,"changePercent":3.45,"volume":0,"currency":"KES","status":"active","timestamp":"2026-10-14T12:00:00Z","source":"delayed"}`), &q)
	return q
}
func quotePipelineNow() time.Time { return time.Date(2026, 10, 14, 13, 0, 0, 0, time.UTC) }

func TestQuotePipelineValidatesEachRecordNotSharedIdentityMembership(t *testing.T) {
	q := fixturePipelineQuote()
	invalid := q
	invalid.Volume = nil
	f := &quotePipelineFixture{quotes: []marketdata.QuoteInput{invalid, q, q}}
	delivered := 0
	p := QuotePipeline{Store: f, Now: quotePipelineNow, AfterCommit: func(context.Context, []json.RawMessage) error {
		if !f.committed {
			t.Fatal("uncommitted event")
		}
		delivered++
		return nil
	}}
	s, err := p.Run(context.Background())
	if err != nil || s.Accepted != 1 || s.Rejected != 2 || s.Changed != 1 || delivered != 1 || len(f.dead) != 2 || f.runs[0].Status != "partial" {
		t.Fatal(s, err, f, delivered)
	}
}
func TestQuotePipelineNeverPublishesFailedWriteOrClaimsAcceptedRows(t *testing.T) {
	f := &quotePipelineFixture{quotes: []marketdata.QuoteInput{fixturePipelineQuote()}, failWrite: true}
	p := QuotePipeline{Store: f, Now: quotePipelineNow, AfterCommit: func(context.Context, []json.RawMessage) error { t.Fatal("failed write published"); return nil }}
	s, err := p.Run(context.Background())
	if err == nil || s.Accepted != 0 || f.runs[0].RecordCount != 0 || f.runs[0].Status != "failed" || f.dead[0].ErrorCode != "persistence-failed" {
		t.Fatal(s, err, f)
	}
}
func TestQuotePipelineNoEvidenceDoesNotCreatePollingWrites(t *testing.T) {
	f := &quotePipelineFixture{}
	_, err := (&QuotePipeline{Store: f, Now: quotePipelineNow}).Run(context.Background())
	if err != nil || f.writes != 0 || len(f.runs) != 0 || len(f.dead) != 0 {
		t.Fatal(err, f)
	}
}
func TestQuotePipelineFailureReceiptsAreRequiredAndPrivate(t *testing.T) {
	f := &quotePipelineFixture{failRead: true, failAudit: true}
	_, err := (&QuotePipeline{Store: f, Now: quotePipelineNow}).Run(context.Background())
	if err == nil || len(f.dead) != 1 || f.dead[0].ErrorCode != "collection-failed" || f.runs[0].Status != "failed" {
		t.Fatal(err, f)
	}
}

func TestQuotePipelineDeliveryFailurePreservesCommittedAccounting(t *testing.T) {
	f := &quotePipelineFixture{quotes: []marketdata.QuoteInput{fixturePipelineQuote()}}
	p := QuotePipeline{Store: f, Now: quotePipelineNow, AfterCommit: func(context.Context, []json.RawMessage) error { return errors.New("private transport failure") }}
	s, err := p.Run(context.Background())
	if err == nil || !f.committed || s.Accepted != 1 || f.runs[0].RecordCount != 1 || f.runs[0].Status != "partial" || f.dead[0].ErrorCode != "publication-failed" {
		t.Fatal(s, err, f)
	}
}
