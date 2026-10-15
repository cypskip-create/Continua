package ingestion

import (
	"context"
	"continua/backend/internal/marketdata"
	"errors"
	"time"
)

type CorporateStore interface {
	AuditStore
	UpsertCorporateAction(context.Context, marketdata.CorporateAction) error
	UpsertEarningsEvent(context.Context, marketdata.EarningsEvent) error
	UpsertOwnership(context.Context, []marketdata.OwnershipRecord) error
}

type CorporateSource interface {
	CorporateActions(context.Context, *string) ([]marketdata.CorporateAction, error)
	EarningsEvents(context.Context, *string) ([]marketdata.EarningsEvent, error)
	Ownership(context.Context, string) ([]marketdata.OwnershipRecord, error)
}

type CorporatePipeline struct {
	Store             CorporateStore
	Source            CorporateSource
	AfterActionCommit func(context.Context, marketdata.CorporateAction) error
}

func validAction(action marketdata.CorporateAction) bool {
	return action.Validate(time.Now().UTC()) == nil
}

// Source methods are native callbacks, not Node forwarding. They must enforce
// the configured source's rights before returning canonical source-backed rows.
func (p *CorporatePipeline) Run(ctx context.Context, since *string, symbols []string) (int, error) {
	if p.Store == nil || p.Source == nil || len(symbols) > 1000 {
		return 0, errors.New("corporate pipeline configuration required")
	}
	if since != nil {
		if _, err := time.Parse(time.RFC3339Nano, *since); err != nil {
			return 0, errors.New("invalid corporate source window")
		}
	}
	audit := newRunAudit(p.Store, "corporate_action", time.Now())
	stored := 0
	actions, err := Retry(ctx, DefaultRetryOptions(), func(ctx context.Context) ([]marketdata.CorporateAction, error) {
		return p.Source.CorporateActions(ctx, since)
	})
	if err != nil {
		return stored, audit.finish(ctx, stored, errors.Join(errors.New("corporate source unavailable"), audit.failure(ctx, "corporate_action", "collection-failed", nil, map[string]any{"since": since})))
	}
	if len(actions) > 1000 {
		return stored, audit.finish(ctx, stored, errors.Join(errors.New("corporate source batch budget"), audit.failure(ctx, "corporate_action", "record-too-large", nil, nil)))
	}
	for _, action := range actions {
		if err := ctx.Err(); err != nil {
			return stored, audit.finish(ctx, stored, err)
		}
		if !validAction(action) {
			if err := audit.failure(ctx, "corporate_action", "validation-failed", &action.SecurityID, action); err != nil {
				return stored, audit.finish(ctx, stored, err)
			}
			continue
		}
		changed := true
		var writeErr error
		if store, ok := p.Store.(interface {
			UpsertCorporateActionChanged(context.Context, marketdata.CorporateAction) (bool, error)
		}); ok {
			changed, writeErr = store.UpsertCorporateActionChanged(ctx, action)
		} else {
			writeErr = p.Store.UpsertCorporateAction(ctx, action)
		}
		if writeErr != nil {
			if err := audit.failure(ctx, "corporate_action", "persistence-failed", &action.SecurityID, action); err != nil {
				return stored, audit.finish(ctx, stored, err)
			}
			continue
		}
		stored++
		if changed && p.AfterActionCommit != nil {
			if err := p.AfterActionCommit(ctx, action); err != nil {
				if err := audit.failure(ctx, "corporate_action", "publication-failed", &action.SecurityID, map[string]any{"id": action.ID}); err != nil {
					return stored, audit.finish(ctx, stored, err)
				}
			}
		}
	}
	earnings, err := Retry(ctx, DefaultRetryOptions(), func(ctx context.Context) ([]marketdata.EarningsEvent, error) {
		return p.Source.EarningsEvents(ctx, since)
	})
	if err != nil {
		return stored, audit.finish(ctx, stored, errors.Join(errors.New("earnings source unavailable"), audit.failure(ctx, "earnings", "collection-failed", nil, nil)))
	}
	if len(earnings) > 1000 {
		return stored, audit.finish(ctx, stored, errors.Join(errors.New("earnings source batch budget"), audit.failure(ctx, "earnings", "record-too-large", nil, nil)))
	}
	for _, event := range earnings {
		if err := ctx.Err(); err != nil {
			return stored, audit.finish(ctx, stored, err)
		}
		if event.Validate(time.Now().UTC()) != nil {
			if err := audit.failure(ctx, "earnings", "validation-failed", &event.SecurityID, event); err != nil {
				return stored, audit.finish(ctx, stored, err)
			}
			continue
		}
		if err := p.Store.UpsertEarningsEvent(ctx, event); err != nil {
			if err := audit.failure(ctx, "earnings", "persistence-failed", &event.SecurityID, event); err != nil {
				return stored, audit.finish(ctx, stored, err)
			}
		} else {
			stored++
		}
	}
	ownership, err := CollectSymbols(ctx, symbols, p.Source.Ownership)
	if err != nil {
		return stored, audit.finish(ctx, stored, err)
	}
	for _, failure := range ownership.Failures {
		if err := audit.failure(ctx, "ownership", "ownership-collection-failed", &failure.Symbol, map[string]any{"symbol": failure.Symbol}); err != nil {
			return stored, audit.finish(ctx, stored, err)
		}
	}
	validOwners := make([]marketdata.OwnershipRecord, 0, len(ownership.Records))
	seenOwners := map[string]bool{}
	for _, record := range ownership.Records {
		key := record.SecurityID + "\x00" + record.HolderName
		if record.Validate(time.Now().UTC()) != nil || seenOwners[key] {
			if err := audit.failure(ctx, "ownership", "validation-failed", &record.SecurityID, record); err != nil {
				return stored, audit.finish(ctx, stored, err)
			}
			continue
		}
		seenOwners[key] = true
		validOwners = append(validOwners, record)
	}
	if len(validOwners) > 0 {
		if err := p.Store.UpsertOwnership(ctx, validOwners); err != nil {
			if err := audit.failure(ctx, "ownership", "persistence-failed", nil, validOwners); err != nil {
				return stored, audit.finish(ctx, stored, err)
			}
		} else {
			stored += len(validOwners)
		}
	}
	return stored, audit.finish(ctx, stored, nil)
}
