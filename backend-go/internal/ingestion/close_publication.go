package ingestion

import (
	"context"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"time"
)

type ClosePublicationStore interface {
	AuditStore
	ObservedCloseCandidates(context.Context, int64, int) ([]json.RawMessage, error)
	PublishObservedCloses(context.Context, []marketdata.ObservedClose, time.Time) error
	CompleteObservedCloseExtraction(context.Context, int64, string, string) error
}
type ClosePublication struct{ Store ClosePublicationStore }
type ClosePublicationSummary struct {
	Cursor                    int64
	Extractions, Observations int
}

func (p *ClosePublication) Run(ctx context.Context, after int64, batch int) (ClosePublicationSummary, error) {
	summary := ClosePublicationSummary{Cursor: after}
	if p.Store == nil || after < 0 || batch < 1 || batch > 100 {
		return summary, errors.New("invalid close publication batch")
	}
	now := time.Now().UTC()
	audit := newRunAudit(p.Store, "candle", now)
	rows, err := p.Store.ObservedCloseCandidates(ctx, after, batch)
	if err != nil {
		return summary, err
	}
	for _, raw := range rows {
		var evidence struct {
			ExtractionID int64             `json:"extractionId"`
			ArtifactID   int64             `json:"artifactId"`
			SourceID     string            `json:"sourceId"`
			Symbol       string            `json:"symbol"`
			Adjustment   string            `json:"adjustment"`
			SourceURL    string            `json:"sourceUrl"`
			Observations []json.RawMessage `json:"observations"`
			Basis        string            `json:"basis"`
		}
		if json.Unmarshal(raw, &evidence) != nil || evidence.ExtractionID <= summary.Cursor || len(evidence.Observations) > 10000 {
			return summary, errors.New("invalid close extraction record")
		}
		observations := []marketdata.ObservedClose{}
		for _, rawObservation := range evidence.Observations {
			var kind struct {
				Kind string `json:"kind"`
			}
			if json.Unmarshal(rawObservation, &kind) != nil {
				return summary, errors.New("invalid close observation JSON")
			}
			if kind.Kind != "historical_close_candidate" {
				continue
			}
			var observation struct {
				Date   string   `json:"date"`
				Close  *float64 `json:"close"`
				Volume *int64   `json:"volume"`
			}
			if json.Unmarshal(rawObservation, &observation) != nil || observation.Close == nil {
				err := audit.failure(ctx, "candle", "validation-failed", &evidence.Symbol, map[string]any{"extractionId": evidence.ExtractionID})
				return summary, audit.finish(ctx, summary.Observations, errors.Join(errors.New("close observation requires source review"), err))
			}
			observations = append(observations, marketdata.ObservedClose{SecurityID: "NSE:" + evidence.Symbol, Symbol: evidence.Symbol, SourceID: evidence.SourceID, Date: observation.Date, Close: *observation.Close, Volume: observation.Volume, Adjustment: evidence.Adjustment, ArtifactID: evidence.ArtifactID, ExtractionID: evidence.ExtractionID, SourceURL: evidence.SourceURL})
		}
		if err := p.Store.PublishObservedCloses(ctx, observations, now); err != nil {
			receipt := audit.failure(ctx, "candle", "publication-failed", &evidence.Symbol, map[string]any{"extractionId": evidence.ExtractionID})
			return summary, audit.finish(ctx, summary.Observations, errors.Join(errors.New("close evidence publication failed"), receipt))
		}
		if err := p.Store.CompleteObservedCloseExtraction(ctx, evidence.ExtractionID, evidence.SourceID, evidence.Basis); err != nil {
			return summary, audit.finish(ctx, summary.Observations, errors.New("close publication receipt could not be committed"))
		}
		summary.Extractions++
		summary.Observations += len(observations)
		summary.Cursor = evidence.ExtractionID
	}
	if len(rows) == 0 {
		return summary, nil
	}
	return summary, audit.finish(ctx, summary.Observations, nil)
}
