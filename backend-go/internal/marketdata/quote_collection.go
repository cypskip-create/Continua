package marketdata

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

// Approval is source/schema-specific. A generic OCR confidence or enabled source
// alone cannot promote an undocumented market quote mapping.
func (s *Store) PublishedQuoteCandidates(ctx context.Context) ([]json.RawMessage, error) {
	return s.JSONRowsBounded(ctx, 2*1024*1024, `SELECT row_to_json(result) FROM (
 SELECT DISTINCT ON(sec.symbol) sec.id AS "securityId",sec.symbol,sec.exchange,sec.currency,sec.status,c.payload AS observation
 FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources src ON src.id=a.source_id
 CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.tables)='array' THEN e.tables ELSE '[]'::jsonb END) c(payload)
 JOIN market.securities sec ON sec.symbol=e.entity->>'ticker' AND sec.exchange='NSE' AND sec.status<>'delisted'
 LEFT JOIN market.live_quotes current ON current.security_id=sec.id
 WHERE src.adapter='mystocks' AND src.enabled=true AND src.redistribution_allowed=true
 AND length(src.config->>'permissionReference') BETWEEN 1 AND 200
 AND src.config->>'quoteMappingApproved'='mystocks-literal-observations-v1'
 AND e.parser_version='mystocks-literal-observations-v1' AND e.method='json' AND a.sha256 ~ '^[a-f0-9]{64}$'
 AND a.storage_path LIKE 'r2://continua-financial-documents/%'
 AND a.document_url ~ '^https://live[.]mystocks[.]co[.]ke/x/f[0-9]+-[A-Z0-9.-]+$'
	 AND (substring(a.document_url from '^https://live[.]mystocks[.]co[.]ke/x/f[0-9]+-([A-Z0-9.-]+)$')=CASE sec.symbol WHEN 'DTB' THEN 'DTK' WHEN 'STANBIC' THEN 'SBIC' WHEN 'HFCB' THEN 'HFCK' ELSE sec.symbol END
	 OR EXISTS(SELECT 1 FROM scraping.artifact_urls provenance WHERE provenance.artifact_id=a.id AND substring(provenance.url from '^https://live[.]mystocks[.]co[.]ke/x/f[0-9]+-([A-Z0-9.-]+)$')=CASE sec.symbol WHEN 'DTB' THEN 'DTK' WHEN 'STANBIC' THEN 'SBIC' WHEN 'HFCB' THEN 'HFCK' ELSE sec.symbol END))
	 AND e.entity->>'exchange'='NSE'
 AND c.payload->>'kind'='market_quote_candidate' AND c.payload->>'symbol'=sec.symbol
	 AND c.payload->>'timestamp' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-5][0-9][.][0-9]{3}Z$'
	 AND pg_input_is_valid(c.payload->>'timestamp','timestamp with time zone')
	 AND c.payload->>'timestamp'<=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
 AND (current.security_id IS NULL OR c.payload->>'timestamp'>to_char(current.event_timestamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
 OR (c.payload->>'timestamp'=to_char(current.event_timestamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
 AND (current.status IS DISTINCT FROM sec.status OR current.source<>'delayed'
 OR NOT c.payload @> jsonb_build_object('lastPrice',current.last_price,'previousClose',current.previous_close,'open',current.open,'high',current.high,'low',current.low,'volume',current.volume,'change',current.change,'changePercent',current.change_percent))))
	 ORDER BY sec.symbol,c.payload->>'timestamp' DESC,a.retrieved_at DESC,e.extracted_at DESC,e.id DESC LIMIT 501) result`)
}

func (s *Store) PublishedQuoteInputs(ctx context.Context) ([]QuoteInput, error) {
	rows, e := s.PublishedQuoteCandidates(ctx)
	if e != nil {
		return nil, e
	}
	if len(rows) > 500 {
		return nil, errors.New("published quote universe budget")
	}
	inputs := []QuoteInput{}
	for _, raw := range rows {
		var item struct {
			SecurityID, Symbol, Exchange, Currency, Status string
			Observation                                    json.RawMessage
		}
		if json.Unmarshal(raw, &item) != nil {
			return nil, errors.New("invalid source quote record")
		}
		var quote QuoteInput
		if json.Unmarshal(item.Observation, &quote) != nil || quote.Symbol != item.Symbol || quote.Currency != item.Currency {
			return nil, errors.New("source quote identity mismatch")
		}
		quote.SecurityID = item.SecurityID
		quote.Exchange = item.Exchange
		quote.Status = item.Status
		quote.Source = "delayed"
		inputs = append(inputs, quote)
	}
	return inputs, nil
}

func (s *Store) RefreshPublishedQuotes(ctx context.Context, now time.Time) ([]json.RawMessage, error) {
	inputs, err := s.PublishedQuoteInputs(ctx)
	if err != nil {
		return nil, err
	}
	valid := []QuoteInput{}
	for _, quote := range inputs {
		if quote.Validate(now) == nil {
			valid = append(valid, quote)
		}
	}
	return s.UpsertQuotesBatch(ctx, valid, now)
}
