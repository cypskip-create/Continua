package ingestion

import (
	"context"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"time"
)

type AuditStore interface {
	RecordDeadLetter(context.Context, marketdata.DeadLetter) error
	RecordIngestionRun(context.Context, marketdata.IngestionRun) error
}

type runAudit struct {
	store AuditStore
	run   marketdata.IngestionRun
}

func newRunAudit(store AuditStore, dataset string, now time.Time) *runAudit {
	return &runAudit{store: store, run: marketdata.IngestionRun{Exchange: "NSE", Dataset: dataset, Status: "success", StartedAt: now.UTC()}}
}

func (a *runAudit) failure(ctx context.Context, dataset, code string, symbol *string, payload any) error {
	a.run.ErrorCount++
	if len(a.run.Errors) < 20 {
		a.run.Errors = append(a.run.Errors, code)
	}
	raw, err := json.Marshal(payload)
	if err != nil || len(raw) > 1048576 {
		raw = json.RawMessage(`{"payloadUnavailable":true}`)
	}
	return a.store.RecordDeadLetter(ctx, marketdata.DeadLetter{Exchange: "NSE", Dataset: dataset, Symbol: symbol, Payload: raw, ErrorCode: code})
}

func (a *runAudit) finish(ctx context.Context, stored int, cause error) error {
	a.run.RecordCount = stored
	if a.run.ErrorCount > 0 || cause != nil {
		a.run.Status = "failed"
		if stored > 0 {
			a.run.Status = "partial"
		}
	}
	a.run.FinishedAt = time.Now().UTC()
	return errors.Join(cause, a.store.RecordIngestionRun(ctx, a.run))
}
