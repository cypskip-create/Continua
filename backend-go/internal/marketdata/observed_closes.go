package marketdata

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/url"
	"sort"
	"strings"
	"time"
)

type ObservedClose struct {
	SecurityID   string  `json:"securityId"`
	Symbol       string  `json:"symbol"`
	SourceID     string  `json:"sourceId"`
	Date         string  `json:"date"`
	Close        float64 `json:"close"`
	Volume       *int64  `json:"volume"`
	Adjustment   string  `json:"adjustment"`
	ArtifactID   int64   `json:"artifactId"`
	ExtractionID int64   `json:"extractionId"`
	SourceURL    string  `json:"sourceUrl"`
}

func (v ObservedClose) validate(now time.Time) error {
	if !instrumentSymbol.MatchString(v.Symbol) || v.SecurityID != "NSE:"+v.Symbol || len(v.SourceID) < 1 || len(v.SourceID) > 200 || v.ArtifactID <= 0 || v.ExtractionID <= 0 || !map[string]bool{"unadjusted": true, "adjusted": true, "unknown": true}[v.Adjustment] {
		return errors.New("invalid close identity or evidence")
	}
	date, err := time.Parse("2006-01-02", v.Date)
	if err != nil || date.After(now.UTC()) || math.IsNaN(v.Close) || math.IsInf(v.Close, 0) || v.Close <= 0 || (v.Volume != nil && (*v.Volume < 0 || *v.Volume > 9007199254740991)) {
		return errors.New("invalid literal daily close")
	}
	u, err := url.Parse(v.SourceURL)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || (u.RawQuery != "" && !(u.Hostname() == "live.mystocks.co.ke" && u.RawQuery == "historical")) || u.Fragment != "" || len(v.SourceURL) > 4096 {
		return errors.New("invalid public close evidence URL")
	}
	provider := v.Symbol
	if alias := map[string]string{"DTB": "DTK", "STANBIC": "SBIC", "HFCB": "HFCK"}[provider]; alias != "" {
		provider = alias
	}
	if !((u.Hostname() == "live.mystocks.co.ke" && u.Path == "/stock="+provider) || (u.Hostname() == "afx.kwayisi.org" && (u.Path == "/nse/"+strings.ToLower(provider)+".html" || u.Path == "/nse/"+strings.ToLower(v.Symbol)+".html"))) {
		return errors.New("daily close issuer URL does not match source ticker")
	}
	return nil
}

// Collection permission is not mapping approval. Promotion requires the
// source-specific close schema/adjustment approval under the same row lock as
// the canonical write, so concurrent permission revocation cannot race it.
func (s *Store) PublishObservedCloses(ctx context.Context, input []ObservedClose, now time.Time) error {
	if len(input) > 10000 {
		return errors.New("daily close publication budget")
	}
	seen := map[string]bool{}
	for _, row := range input {
		if err := row.validate(now); err != nil {
			return err
		}
		key := row.SourceID + "|" + row.SecurityID + "|" + row.Date
		if seen[key] {
			return errors.New("duplicate daily close identity")
		}
		seen[key] = true
	}
	if len(input) == 0 {
		return nil
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	approved := map[string]string{}
	sourceIDs := []string{}
	for _, row := range input {
		if _, ok := approved[row.SourceID]; !ok {
			approved[row.SourceID] = ""
			sourceIDs = append(sourceIDs, row.SourceID)
		}
	}
	sort.Strings(sourceIDs)
	for _, source := range sourceIDs {
		var adjustment string
		if err := tx.QueryRowContext(ctx, `SELECT config->>'historyAdjustment' FROM scraping.sources WHERE id=$1 AND enabled AND redistribution_allowed=true AND length(trim(config->>'permissionReference')) BETWEEN 1 AND 200 AND config->>'closeMappingApproved'='publisher-daily-close-v1' AND config->>'historyAdjustment' IN('unadjusted','adjusted','unknown') FOR SHARE`, source).Scan(&adjustment); err != nil {
			return errors.New("daily close source permission or mapping unavailable")
		}
		approved[source] = adjustment
	}
	for _, row := range input {
		if approved[row.SourceID] != row.Adjustment {
			return errors.New("daily close adjustment does not match source approval")
		}
	}
	// Bounded set-based writes avoid thousands of remote SQL round trips for a
	// ten-year history. Every chunk remains inside this one atomic transaction.
	for start := 0; start < len(input); start += 500 {
		end := min(start+500, len(input))
		payload, err := json.Marshal(input[start:end])
		if err != nil {
			return err
		}
		var attached bool
		var written int
		err = tx.QueryRowContext(ctx, `WITH input AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS i("securityId" text,symbol text,"sourceId" text,date text,close numeric,volume bigint,adjustment text,"artifactId" bigint,"extractionId" bigint,"sourceUrl" text)), valid AS (SELECT i.* FROM input i JOIN market.securities sec ON sec.id=i."securityId" AND sec.symbol=i.symbol AND sec.exchange='NSE' JOIN scraping.extractions e ON e.id=i."extractionId" JOIN scraping.raw_artifacts a ON a.id=e.artifact_id AND a.id=i."artifactId" AND a.source_id=i."sourceId" JOIN scraping.sources src ON src.id=a.source_id WHERE e.entity->>'ticker' IN(i.symbol,CASE i.symbol WHEN 'DTB' THEN 'DTK' WHEN 'STANBIC' THEN 'SBIC' WHEN 'HFCB' THEN 'HFCK' ELSE i.symbol END) AND e.entity->>'exchange'='NSE' AND a.storage_path LIKE 'r2://continua-financial-documents/%' AND a.sha256 ~ '^[a-f0-9]{64}$' AND CASE WHEN src.adapter='mystocks' THEN a.source_url ELSE a.document_url END=i."sourceUrl" AND e.tables @> jsonb_build_array(jsonb_build_object('kind','historical_close_candidate','date',i.date,'close',i.close,'volume',i.volume))), written AS (INSERT INTO market.observed_daily_closes(security_id,observed_date,source_id,close,volume,adjustment,artifact_id,extraction_id,source_url) SELECT "securityId",date::date,"sourceId",close,volume,adjustment,"artifactId","extractionId","sourceUrl" FROM valid WHERE (SELECT count(*) FROM valid)=(SELECT count(*) FROM input) ON CONFLICT(security_id,observed_date,source_id) DO UPDATE SET close=EXCLUDED.close,volume=EXCLUDED.volume,adjustment=EXCLUDED.adjustment,artifact_id=EXCLUDED.artifact_id,extraction_id=EXCLUDED.extraction_id,source_url=EXCLUDED.source_url,published_at=now() WHERE EXCLUDED.extraction_id>=observed_daily_closes.extraction_id AND (observed_daily_closes.close,observed_daily_closes.volume,observed_daily_closes.adjustment) IS DISTINCT FROM (EXCLUDED.close,EXCLUDED.volume,EXCLUDED.adjustment) RETURNING 1) SELECT (SELECT count(*) FROM valid)=(SELECT count(*) FROM input),(SELECT count(*) FROM written)`, string(payload)).Scan(&attached, &written)
		if err != nil {
			return err
		}
		if !attached {
			return errors.New("daily close does not match immutable source evidence or registry")
		}
	}
	return tx.Commit()
}

func (s *Store) ObservedCloseCandidates(ctx context.Context, after int64, limit int) ([]json.RawMessage, error) {
	if after < 0 || limit < 1 || limit > 100 {
		return nil, errors.New("invalid close extraction cursor")
	}
	return s.JSONRowsBounded(ctx, 2*1024*1024, `SELECT row_to_json(result) FROM (
 SELECT e.id AS "extractionId",a.id AS "artifactId",a.source_id AS "sourceId",sec.symbol,
 src.config->>'historyAdjustment' AS adjustment,
 CASE WHEN src.adapter='mystocks' THEN a.source_url ELSE a.document_url END AS "sourceUrl",e.tables AS observations,
 md5(jsonb_build_array(e.tables,e.entity,src.config->>'closeMappingApproved',src.config->>'historyAdjustment',src.config->>'permissionReference')::text) AS basis
 FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources src ON src.id=a.source_id
 JOIN market.securities sec ON sec.exchange='NSE' AND sec.status<>'delisted' AND sec.symbol=CASE e.entity->>'ticker' WHEN 'DTK' THEN 'DTB' WHEN 'SBIC' THEN 'STANBIC' WHEN 'HFCK' THEN 'HFCB' ELSE e.entity->>'ticker' END
 WHERE e.id>$1 AND src.enabled AND src.redistribution_allowed=true
 AND length(trim(src.config->>'permissionReference')) BETWEEN 1 AND 200
 AND src.config->>'closeMappingApproved'='publisher-daily-close-v1' AND e.entity->>'exchange'='NSE'
 AND jsonb_typeof(e.tables)='array' AND e.tables @> '[{"kind":"historical_close_candidate"}]'::jsonb
 AND NOT EXISTS(SELECT 1 FROM market.close_publication_receipts receipt WHERE receipt.extraction_id=e.id
 AND receipt.basis=md5(jsonb_build_array(e.tables,e.entity,src.config->>'closeMappingApproved',src.config->>'historyAdjustment',src.config->>'permissionReference')::text))
 ORDER BY e.id LIMIT $2) result`, after, limit)
}

func (s *Store) CompleteObservedCloseExtraction(ctx context.Context, extraction int64, source, basis string) error {
	if extraction <= 0 || len(source) < 1 || len(source) > 200 || len(basis) != 32 {
		return errors.New("invalid close publication receipt")
	}
	result, err := s.DB.ExecContext(ctx, `WITH approved AS (SELECT src.id FROM scraping.sources src JOIN scraping.raw_artifacts a ON a.source_id=src.id JOIN scraping.extractions e ON e.artifact_id=a.id WHERE e.id=$1 AND src.id=$2 AND src.enabled AND src.redistribution_allowed=true AND src.config->>'closeMappingApproved'='publisher-daily-close-v1' AND length(trim(src.config->>'permissionReference')) BETWEEN 1 AND 200 AND md5(jsonb_build_array(e.tables,e.entity,src.config->>'closeMappingApproved',src.config->>'historyAdjustment',src.config->>'permissionReference')::text)=$3 FOR SHARE OF src) INSERT INTO market.close_publication_receipts(extraction_id,source_id,basis) SELECT $1,id,$3 FROM approved ON CONFLICT(extraction_id) DO UPDATE SET source_id=EXCLUDED.source_id,basis=EXCLUDED.basis,completed_at=now()`, extraction, source, basis)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return errors.New("close evidence or permission changed before completion")
	}
	return nil
}

// Separate wire shape explicitly advertises absent OHLC, never flat candles.
// Multiple sources remain visible rather than silently choosing a winner.
func (s *Store) DailyCloseHistory(ctx context.Context, id string, from, to time.Time) ([]json.RawMessage, error) {
	if !strings.HasPrefix(id, "NSE:") || from.After(to) {
		return nil, errors.New("invalid daily close history request")
	}
	rows, err := s.JSONRowsBounded(ctx, 4*1024*1024, `SELECT row_to_json(result) FROM (SELECT c.security_id AS "securityId",to_char(c.observed_date,'YYYY-MM-DD') AS date,c.close,c.volume,c.adjustment,c.source_url AS "sourceUrl",c.source_id AS "sourceId",'daily_close_only' AS basis,NULL::numeric AS open,NULL::numeric AS high,NULL::numeric AS low FROM market.observed_daily_closes c JOIN scraping.sources src ON src.id=c.source_id WHERE c.security_id=$1 AND c.observed_date BETWEEN $2::date AND $3::date AND src.enabled AND src.redistribution_allowed=true AND src.config->>'closeMappingApproved'='publisher-daily-close-v1' AND length(trim(src.config->>'permissionReference')) BETWEEN 1 AND 200 ORDER BY c.observed_date,c.source_id LIMIT 10001) result`, id, from.UTC().Format("2006-01-02"), to.UTC().Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	legacy, err := s.JSONRowsBounded(ctx, 4*1024*1024, legacyProviderCloseSQL, id, from.UTC().Format("2006-01-02"), to.UTC().Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	publisher, err := s.JSONRowsBounded(ctx, 4*1024*1024, publisherCloseSQL, id, "1d", from, to)
	if err != nil {
		return nil, err
	}
	rows = append(rows, legacy...)
	rows = append(rows, publisher...)
	total := 0
	for _, row := range rows {
		total += len(row)
	}
	if len(rows) > 10000 || total > 4*1024*1024 {
		return nil, ErrReadBudget
	}
	sort.SliceStable(rows, func(i, j int) bool {
		var a, b struct {
			Date string `json:"date"`
		}
		_ = json.Unmarshal(rows[i], &a)
		_ = json.Unmarshal(rows[j], &b)
		return a.Date < b.Date
	})
	return rows, nil

}
