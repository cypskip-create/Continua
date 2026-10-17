package marketdata

import (
	"context"
	"encoding/json"
	"sort"
	"time"
)

const publisherDailySQL = `WITH latest AS (
 SELECT p.payload,a.document_url,e.extracted_at,e.id FROM scraping.processed_research p
 JOIN scraping.extractions e ON e.id=p.extraction_id
 JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources s ON s.id=a.source_id
 WHERE p.security_id=$1 AND p.processor_version='collected-research-v1'
 AND p.destination='history' AND p.status='publisher_observation'
 AND s.enabled AND s.redistribution_allowed=true
 AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
 AND a.storage_path LIKE 'r2://continua-financial-documents/%' AND a.sha256 ~ '^[a-f0-9]{64}$'
) SELECT row_to_json(result) FROM (
 SELECT DISTINCT ON(r.date) $1::text AS "securityId",'1d' AS interval,
 to_char(r.date::date,'YYYY-MM-DD')||'T00:00:00.000Z' AS timestamp,
 r.open,r.high,r.low,r.close,r.volume,l.document_url AS "sourceUrl",
 'publisher_observation' AS basis,'unknown' AS adjustment
 FROM latest l CROSS JOIN LATERAL jsonb_to_recordset(l.payload->'history')
 AS r(date text,open numeric,high numeric,low numeric,close numeric,volume numeric)
 WHERE r.date::date<=CURRENT_DATE AND r.date::date::timestamp AT TIME ZONE 'UTC' BETWEEN $2 AND $3
 AND r.open>0 AND r.close>0 AND r.low>0 AND r.high>=greatest(r.open,r.close,r.low)
 AND r.low<=least(r.open,r.close) AND r.volume>=0 ORDER BY r.date,l.extracted_at DESC,l.id DESC
) result`

func (s *Store) publisherDaily(ctx context.Context, id string, from, to time.Time, canonical []json.RawMessage) ([]json.RawMessage, error) {
	observed, err := s.JSONRows(ctx, publisherDailySQL, id, from, to)
	if err != nil {
		return nil, err
	}
	dates := map[string]bool{}
	stamp := func(raw json.RawMessage) string {
		var r struct {
			Timestamp string `json:"timestamp"`
		}
		_ = json.Unmarshal(raw, &r)
		if len(r.Timestamp) >= 10 {
			return r.Timestamp[:10]
		}
		return r.Timestamp
	}
	for _, r := range canonical {
		dates[stamp(r)] = true
	}
	for _, r := range observed {
		if !dates[stamp(r)] {
			canonical = append(canonical, r)
			dates[stamp(r)] = true
		}
	}
	sort.SliceStable(canonical, func(i, j int) bool { return stamp(canonical[i]) < stamp(canonical[j]) })
	return canonical, nil
}
