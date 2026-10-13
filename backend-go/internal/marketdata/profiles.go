package marketdata

import (
	"context"
	"encoding/json"
	"strings"
)

func (s *Store) CompanyProfile(ctx context.Context, exchange, symbol string) (json.RawMessage, error) {
	rows, err := s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT s.id,s.symbol,s.exchange,s.company_id AS "companyId",s.currency,s.status,s.isin,s.listed_at::text AS "listedAt",json_build_object('id',s.company_id,'name',c.name,'description',c.description,'headquarters',c.headquarters,'ceo',c.ceo,'employees',c.employees,'founded',c.founded,'website',c.website,'sectorName',sec.name,'sectorId',c.sector_id) AS company FROM market.securities s JOIN market.companies c ON c.id=s.company_id LEFT JOIN market.sectors sec ON sec.id=c.sector_id WHERE s.exchange=$1 AND s.status<>'delisted' AND s.symbol=$2) result`, exchange, symbol)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[0], nil
}
func (s *Store) PublisherProfileRows(ctx context.Context, symbol string) ([]json.RawMessage, error) {
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT e.tables,a.document_url AS "sourceUrl",to_char(a.retrieved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "observedAt" FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources s ON s.id=a.source_id WHERE a.source_id='afx-company-history' AND s.enabled AND e.entity->>'ticker'=$1 AND a.document_url=$2 AND a.sha256 ~ '^[a-f0-9]{64}$' ORDER BY e.extracted_at DESC,e.id DESC LIMIT 1) result`, symbol, "https://afx.kwayisi.org/nse/"+strings.ToLower(symbol)+".html")
}
func (s *Store) PublisherFinancialRows(ctx context.Context, ticker string) ([]json.RawMessage, error) {
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT DISTINCT ON(a.metadata->>'category') e.tables,a.document_url AS "sourceUrl",to_char(a.retrieved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "observedAt" FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources s ON s.id=a.source_id WHERE a.source_id='kenyanstocks' AND s.enabled AND s.redistribution_allowed=true AND e.entity->>'ticker'=$1 AND a.sha256 ~ '^[a-f0-9]{64}$' AND a.metadata->>'tab'='Financials' AND a.content_type LIKE 'text/html%' ORDER BY a.metadata->>'category',e.extracted_at DESC,e.id DESC) result`, ticker)
}
