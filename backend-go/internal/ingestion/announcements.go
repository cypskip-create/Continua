package ingestion

import (
	"context"
	"continua/backend/internal/engine"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"time"
)

type AnnouncementStore interface {
	PendingAnnouncementExtractions(context.Context, int) ([]int64, error)
	AnnouncementExtraction(context.Context, int64) (json.RawMessage, error)
	CompanyDirectory(context.Context, string) ([]json.RawMessage, error)
	UpsertAnnouncement(context.Context, marketdata.Announcement) error
	RecordAnnouncementFailure(context.Context, int64) error
	RecordAnnouncementRun(context.Context, time.Time, int, int) error
}
type AnnouncementBridge struct {
	Store  AnnouncementStore
	Worker Calculator
}
type AnnouncementSummary struct {
	Processed  int `json:"processed"`
	Resolved   int `json:"resolved"`
	Unresolved int `json:"unresolved"`
	Failed     int `json:"failed"`
}

func (s *AnnouncementBridge) Run(ctx context.Context, exchange string, batch int) (*AnnouncementSummary, error) {
	if exchange != "NSE" || s.Store == nil || s.Worker == nil || batch < 1 || batch > 100 {
		return nil, errors.New("invalid native announcement bridge")
	}
	started := time.Now().UTC()
	ids, err := s.Store.PendingAnnouncementExtractions(ctx, batch)
	if err != nil {
		return nil, err
	}
	companies, err := s.Store.CompanyDirectory(ctx, exchange)
	if err != nil {
		return nil, err
	}
	if len(companies) == 0 {
		return nil, errors.New("issuer directory unavailable")
	}
	summary := &AnnouncementSummary{}
	for _, id := range ids {
		if err := ctx.Err(); err != nil {
			return summary, err
		}
		summary.Processed++
		raw, err := s.Store.AnnouncementExtraction(ctx, id)
		if err == nil && raw != nil {
			calculated, e := s.Worker.Calculate(ctx, engine.Request{Operation: "announcement_ingestion_input", Args: []any{raw, companies}})
			err = e
			if err == nil {
				var input marketdata.Announcement
				if json.Unmarshal(calculated, &input) != nil || input.ExtractionID != id || input.Exchange != "NSE" {
					err = errors.New("invalid announcement publication response")
				} else {
					err = s.Store.UpsertAnnouncement(ctx, input)
					if err == nil {
						if input.SecurityID != nil {
							summary.Resolved++
						} else {
							summary.Unresolved++
						}
					}
				}
			}
		}
		if err != nil {
			summary.Failed++
			if err := s.Store.RecordAnnouncementFailure(ctx, id); err != nil {
				return summary, err
			}
		}
	}
	if err := s.Store.RecordAnnouncementRun(ctx, started, summary.Processed, summary.Failed); err != nil {
		return summary, err
	}
	return summary, nil
}
