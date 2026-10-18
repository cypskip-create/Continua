package marketdata

import (
	"context"
	"continua/backend/internal/objectstore"
	"encoding/json"
	"errors"
)

// CollectedResearch reads processed observations, not original R2 document bodies.
// Current source permission is checked again even for previously published data.
func (s *Store) CollectedResearch(ctx context.Context, symbol string, limit, offset int) ([]json.RawMessage, error) {
	return s.CollectedResearchFiltered(ctx, symbol, limit, offset, nil)
}
func (s *Store) CollectedResearchFiltered(ctx context.Context, symbol string, limit, offset int, destinations []string) ([]json.RawMessage, error) {
	if limit < 1 || limit > 100 || offset < 0 || offset > 100000 {
		return nil, errors.New("invalid research page")
	}
	allowed := map[string]bool{"financials": true, "overview": true, "ownership": true, "statistics": true, "news": true, "corporateActions": true, "history": true, "documents": true, "additionalResearch": true}
	if len(destinations) > 9 {
		return nil, errors.New("invalid research destinations")
	}
	for _, d := range destinations {
		if !allowed[d] {
			return nil, errors.New("invalid research destinations")
		}
	}
	filter := ""
	args := []any{"NSE:" + symbol, limit, offset}
	if len(destinations) > 0 {
		filter = " AND p.destination=ANY($4::text[]) "
		args = append(args, destinations)
	}
	projection, fields, join := "payload", "", ""
	if s.ProcessedObjects != nil {
		projection = `jsonb_build_object('payload',payload,'receipt',jsonb_build_object('extraction_id',extraction_id,'processor_version',processor_version,'security_id',security_id,'destination',destination,'status',status,'object_uri',object_uri,'sha256',sha256,'size_bytes',size_bytes))`
		fields = `,p.extraction_id,p.processor_version,p.security_id,p.destination,p.status,c.object_uri,c.sha256,c.size_bytes`
		join = ` LEFT JOIN scraping.processed_cloud_archive c ON c.extraction_id=p.extraction_id AND c.processor_version=p.processor_version AND c.processed_at=p.processed_at `
	}
	rows, err := s.JSONRows(ctx, `SELECT `+projection+` FROM (
      SELECT DISTINCT ON(p.destination,p.payload->>'tab',coalesce(p.payload->>'category',''),
        CASE WHEN p.destination='documents' THEN a.document_url ELSE '' END)
        p.payload,e.extracted_at,e.id `+fields+`
      FROM scraping.processed_research p JOIN scraping.extractions e ON e.id=p.extraction_id
      `+join+`
      JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources s ON s.id=a.source_id
      WHERE p.security_id=$1 AND p.processor_version='collected-research-v1' `+filter+`
        AND p.status IN ('publisher_observation','review_required','empty') AND p.destination<>'review'
        AND s.enabled AND s.redistribution_allowed=true
        AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
        AND a.storage_path LIKE 'r2://continua-financial-documents/%' AND a.sha256 ~ '^[a-f0-9]{64}$'
      ORDER BY p.destination,p.payload->>'tab',coalesce(p.payload->>'category',''),
        CASE WHEN p.destination='documents' THEN a.document_url ELSE '' END,e.extracted_at DESC,e.id DESC
    ) latest ORDER BY extracted_at DESC,id DESC LIMIT $2 OFFSET $3`, args...)
	if err != nil || s.ProcessedObjects == nil {
		return rows, err
	}
	result := make([]json.RawMessage, 0, len(rows))
	size := 0
	for _, raw := range rows {
		var record struct {
			Payload json.RawMessage     `json:"payload"`
			Receipt objectstore.Receipt `json:"receipt"`
		}
		if json.Unmarshal(raw, &record) != nil {
			return nil, errors.New("invalid processed cloud metadata")
		}
		payload := record.Payload
		if record.Receipt.ObjectURI != "" {
			payload, err = s.ProcessedObjects.Read(ctx, record.Receipt)
			if err != nil {
				return nil, err
			}
		} else if s.ProcessedStorageMode == "r2" {
			return nil, errors.New("processed cloud object is pending")
		}
		size += len(payload)
		if size > 8*1024*1024 {
			return nil, errors.New("collected research response too large")
		}
		result = append(result, payload)
	}
	return result, nil
}
