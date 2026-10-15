package ingestion

import (
	"context"
	"continua/backend/internal/marketdata"
	"errors"
	"time"
)

type IndexStore interface {
	AuditStore
	ReadPublishedNSEIndices(context.Context, time.Time) ([]marketdata.IndexInput, error)
	UpsertIndicesBatch(context.Context, []marketdata.IndexInput, time.Time) error
	PublishNSEIndexHistory(context.Context, []marketdata.IndexInput, time.Time) error
}

type IndexPipeline struct {
	Store       IndexStore
	AfterCommit func(context.Context) error
}

func (p *IndexPipeline) Run(ctx context.Context) (int, error) {
	if p.Store == nil {
		return 0, errors.New("index pipeline store required")
	}
	now := time.Now().UTC()
	audit := newRunAudit(p.Store, "index", now)
	rows, err := p.Store.ReadPublishedNSEIndices(ctx, now)
	if err != nil {
		return 0, audit.finish(ctx, 0, errors.Join(errors.New("index source unavailable"), audit.failure(ctx, "index", "collection-failed", nil, nil)))
	}
	if len(rows) == 0 {
		return 0, nil
	}
	if len(rows) > 100 {
		return 0, audit.finish(ctx, 0, errors.Join(errors.New("index batch budget"), audit.failure(ctx, "index", "record-too-large", nil, nil)))
	}
	valid := []marketdata.IndexInput{}
	seen := map[string]bool{}
	for _, row := range rows {
		if row.Validate(now) != nil || seen[row.ID] {
			if err := audit.failure(ctx, "index", "validation-failed", &row.Code, row); err != nil {
				return 0, audit.finish(ctx, 0, err)
			}
			continue
		}
		seen[row.ID] = true
		valid = append(valid, row)
	}
	if len(valid) == 0 {
		return 0, audit.finish(ctx, 0, nil)
	}
	if err := p.Store.UpsertIndicesBatch(ctx, valid, now); err != nil {
		return 0, audit.finish(ctx, 0, errors.Join(errors.New("index persistence failed"), audit.failure(ctx, "index", "persistence-failed", nil, nil)))
	}
	stored := len(valid)
	if p.AfterCommit != nil {
		if err := p.AfterCommit(ctx); err != nil {
			return stored, audit.finish(ctx, stored, errors.Join(errors.New("index cache invalidation failed"), audit.failure(ctx, "index", "publication-failed", nil, nil)))
		}
	}
	if err := p.Store.PublishNSEIndexHistory(ctx, valid, now); err != nil {
		return stored, audit.finish(ctx, stored, errors.Join(errors.New("index history publication failed"), audit.failure(ctx, "index", "publication-failed", nil, nil)))
	}
	return stored, audit.finish(ctx, stored, nil)
}
