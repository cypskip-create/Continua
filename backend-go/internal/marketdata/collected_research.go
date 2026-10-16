package marketdata

import (
	"context"
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
	return s.JSONRows(ctx, `SELECT payload FROM (
      SELECT DISTINCT ON(p.destination,p.payload->>'tab',coalesce(p.payload->>'category',''),
        CASE WHEN p.destination='documents' THEN a.document_url ELSE '' END)
        p.payload,e.extracted_at,e.id
      FROM scraping.processed_research p JOIN scraping.extractions e ON e.id=p.extraction_id
      JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources s ON s.id=a.source_id
      WHERE p.security_id=$1 AND p.processor_version='collected-research-v1' `+filter+`
        AND p.status IN ('publisher_observation','review_required','empty') AND p.destination<>'review'
        AND s.enabled AND s.redistribution_allowed=true
        AND length(trim(s.config->>'permissionReference')) BETWEEN 1 AND 200
        AND a.storage_path LIKE 'r2://continua-financial-documents/%' AND a.sha256 ~ '^[a-f0-9]{64}$'
      ORDER BY p.destination,p.payload->>'tab',coalesce(p.payload->>'category',''),
        CASE WHEN p.destination='documents' THEN a.document_url ELSE '' END,e.extracted_at DESC,e.id DESC
    ) latest ORDER BY extracted_at DESC,id DESC LIMIT $2 OFFSET $3`, args...)
}
