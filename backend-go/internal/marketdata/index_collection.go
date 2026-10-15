package marketdata

import (
	"context"
	"encoding/json"
	"math"
	"time"
)

// External source fetching stays in the collector. This reads only its official
// configured extraction and never substitutes retrieval time for session time.
func (s *Store) ReadPublishedNSEIndices(ctx context.Context, now time.Time) ([]IndexInput, error) {
	rows, e := s.JSONRowsBounded(ctx, 128*1024, `SELECT e.tables FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources src ON src.id=a.source_id WHERE a.source_id='nse-index-summary' AND a.document_url='https://www.nse.co.ke/' AND src.enabled=true AND length(src.config->>'permissionReference') BETWEEN 1 AND 200 AND e.tables @> '[{"kind":"nse_index"}]'::jsonb ORDER BY a.retrieved_at DESC,e.extracted_at DESC LIMIT 1`)
	if e != nil {
		return nil, e
	}
	out := []IndexInput{}
	if len(rows) == 0 {
		return out, nil
	}
	var observations []struct {
		Kind   string   `json:"kind"`
		Code   string   `json:"code"`
		Value  *float64 `json:"value"`
		Change *float64 `json:"change"`
		AsOf   string   `json:"asOf"`
	}
	if e = json.Unmarshal(rows[0], &observations); e != nil {
		return nil, e
	}
	names := map[string]string{"NASI": "NSE All-Share Index", "NSE20": "NSE 20 Share Index", "NSE25": "NSE 25 Share Index", "NSE10": "NSE 10 Share Index"}
	seen := map[string]bool{}
	for _, r := range observations {
		if r.Kind != "nse_index" || names[r.Code] == "" || r.Value == nil || r.Change == nil || math.IsNaN(*r.Value) || math.IsInf(*r.Value, 0) || math.IsNaN(*r.Change) || math.IsInf(*r.Change, 0) {
			continue
		}
		at, e := time.Parse(time.RFC3339Nano, r.AsOf)
		previous := *r.Value - *r.Change
		if e != nil || at.After(now) || *r.Value <= 0 || previous <= 0 || seen[r.Code] {
			continue
		}
		seen[r.Code] = true
		percent := *r.Change / previous * 100
		out = append(out, IndexInput{ID: "NSE:index:" + r.Code, Code: r.Code, Name: names[r.Code], Exchange: "NSE", Currency: "KES", Source: "eod", Timestamp: at.UTC().Format(time.RFC3339Nano), Value: r.Value, PreviousClose: &previous, Change: r.Change, ChangePercent: &percent})
	}
	return out, nil
}

func (s *Store) RefreshPublishedNSEIndices(ctx context.Context, now time.Time) error {
	indices, e := s.ReadPublishedNSEIndices(ctx, now)
	if e != nil {
		return e
	}
	if e = s.UpsertIndicesBatch(ctx, indices, now); e != nil {
		return e
	}
	return s.PublishNSEIndexHistory(ctx, indices, now)
}
