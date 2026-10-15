package publication

import (
	"context"
	"continua/backend/internal/engine"
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
	"time"
)

const candidateUpsertSQL = `INSERT INTO market.financial_statement_candidates
 (company_id,security_id,raw_company_name,source,exchange,document_url,document_title,table_index,detected_table,detection_confidence,scraped_artifact_id,scraped_extraction_id)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
 ON CONFLICT(scraped_extraction_id,table_index) DO UPDATE SET company_id=EXCLUDED.company_id,security_id=EXCLUDED.security_id,
 detected_table=EXCLUDED.detected_table,detection_confidence=EXCLUDED.detection_confidence,updated_at=now()
 WHERE market.financial_statement_candidates.status='pending'`

type Candidate struct {
	CompanyID, SecurityID, RawCompanyName *string
	Source, Exchange, DocumentURL         string
	DocumentTitle                         *string
	TableIndex                            int
	DetectedTable                         json.RawMessage
	DetectionConfidence                   *float64
	ArtifactID, ExtractionID              int64
}
type Executor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func UpsertCandidate(ctx context.Context, db Executor, c Candidate) error {
	_, err := upsertCandidateAffected(ctx, db, c)
	return err
}
func upsertCandidateAffected(ctx context.Context, db Executor, c Candidate) (bool, error) {
	if !json.Valid(c.DetectedTable) {
		return false, errors.New("invalid source candidate table")
	}
	result, err := db.ExecContext(ctx, candidateUpsertSQL, c.CompanyID, c.SecurityID, c.RawCompanyName, c.Source, c.Exchange, c.DocumentURL, c.DocumentTitle, c.TableIndex, string(c.DetectedTable), c.DetectionConfidence, c.ArtifactID, c.ExtractionID)
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	return count > 0, err
}

const pendingCandidatesSQL = `SELECT e.id
 FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
 WHERE jsonb_typeof(e.tables)='array'
 AND a.source_id NOT IN('cbk-bond-history','cbk-bill-history','nse-market-reports','nse-index-summary')
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e.tables)='array' THEN e.tables ELSE '[]'::jsonb END) WITH ORDINALITY AS t(observed,position)
 WHERE jsonb_typeof(t.observed->'rows')='array'
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.observed->'rows')='array' THEN t.observed->'rows' ELSE '[]'::jsonb END) r WHERE jsonb_typeof(r->'values')='array')
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.observed->'rows')='array' THEN t.observed->'rows' ELSE '[]'::jsonb END) r
 WHERE COALESCE(jsonb_typeof(r->'label'),'')<>'string' OR COALESCE(jsonb_typeof(r->'values'),'')<>'array')
 AND NOT EXISTS(SELECT 1 FROM market.financial_statement_candidates c WHERE c.scraped_extraction_id=e.id AND c.table_index=t.position-1))
 ORDER BY e.extracted_at ASC LIMIT $1`

type candidateExtraction struct {
	ID, ArtifactID int64
	Confidence     *float64
	Tables, Entity json.RawMessage
	URL, Source    string
	Title          *string
}
type CandidateSummary struct {
	ExtractionsProcessed int `json:"extractionsProcessed"`
	CandidatesCreated    int `json:"candidatesCreated"`
	Resolved             int `json:"resolved"`
	Unresolved           int `json:"unresolved"`
	Failed               int `json:"failed"`
}

var exactTicker = regexp.MustCompile(`^[A-Z0-9-]{1,20}$`)

func (s *Service) CandidateBridge(ctx context.Context, exchange string, limit int) (*CandidateSummary, error) {
	if exchange != "NSE" || limit < 1 || limit > 100 {
		return nil, errors.New("invalid candidate bridge scope")
	}
	started := time.Now().UTC()
	rows, err := s.DB.QueryContext(ctx, pendingCandidatesSQL, limit)
	if err != nil {
		return nil, err
	}
	pending := []int64{}
	for rows.Next() {
		var id int64
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		pending = append(pending, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	summary := &CandidateSummary{}
	failures := []string{}
	for _, id := range pending {
		if err := ctx.Err(); err != nil {
			return summary, err
		}
		// No batch of full extracted documents remains resident between writes.
		var row candidateExtraction
		var tables, entity []byte
		err := s.DB.QueryRowContext(ctx, `SELECT e.id,e.confidence::float8,e.tables,e.entity,a.id,a.document_url,a.title,a.source_id
 FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id WHERE e.id=$1`, id).Scan(&row.ID, &row.Confidence, &tables, &entity, &row.ArtifactID, &row.URL, &row.Title, &row.Source)
		if err != nil {
			return summary, err
		}
		row.Tables, row.Entity = tables, entity
		summary.ExtractionsProcessed++
		created, resolved, e := s.bridgeExtraction(ctx, exchange, row)
		// A later table can fail after earlier immutable candidates were persisted.
		// Preserve that count in the audit rather than claiming no work happened.
		summary.CandidatesCreated += created
		if e != nil {
			summary.Failed++
			failures = append(failures, "Native source extraction candidate failed")
			payload, _ := json.Marshal(map[string]any{"extractionId": row.ID, "documentUrl": row.URL})
			if _, err = s.DB.ExecContext(ctx, `INSERT INTO market.dead_letters(exchange,dataset,symbol,payload,error,occurred_at) VALUES($1,'financial_statement_candidate',NULL,$2::jsonb,$3,now())`, exchange, string(payload), "Native candidate mapping/persistence unavailable"); err != nil {
				return nil, err
			}
			continue
		}
		if resolved {
			summary.Resolved++
		} else {
			summary.Unresolved++
		}
	}
	status := "success"
	if summary.Failed > 0 {
		status = "failed"
		if summary.ExtractionsProcessed > summary.Failed {
			status = "partial"
		}
	}
	var logErrors any
	if len(failures) > 0 {
		raw, _ := json.Marshal(failures)
		logErrors = string(raw)
	}
	_, err = s.DB.ExecContext(ctx, `INSERT INTO market.ingestion_logs(exchange,dataset,status,record_count,error_count,started_at,finished_at,errors) VALUES($1,'financial_statement_candidate',$2,$3,$4,$5,$6,$7::jsonb)`, exchange, status, summary.CandidatesCreated, summary.Failed, started, time.Now().UTC(), logErrors)
	if err != nil {
		return nil, err
	}
	return summary, nil
}

func (s *Service) bridgeExtraction(ctx context.Context, exchange string, row candidateExtraction) (int, bool, error) {
	var entity map[string]any
	var tables []json.RawMessage
	if json.Unmarshal(row.Entity, &entity) != nil || json.Unmarshal(row.Tables, &tables) != nil {
		return 0, false, errors.New("invalid extraction evidence")
	}
	rawName := row.Title
	if value, exists := entity["companyName"]; exists && value != nil {
		name, ok := value.(string)
		if !ok {
			return 0, false, errors.New("invalid issuer name")
		}
		rawName = &name
	}
	var companyID, securityID *string
	if ticker, ok := entity["ticker"].(string); ok && exactTicker.MatchString(ticker) {
		matches, err := s.DB.QueryContext(ctx, `SELECT company_id,id FROM market.securities WHERE exchange=$1 AND symbol=$2`, exchange, ticker)
		if err != nil {
			return 0, false, err
		}
		count := 0
		var company, security string
		for matches.Next() {
			if err = matches.Scan(&company, &security); err != nil {
				matches.Close()
				return 0, false, err
			}
			count++
		}
		err = matches.Err()
		matches.Close()
		if err != nil {
			return 0, false, err
		}
		if count == 1 {
			companyID = &company
			securityID = &security
		}
	}
	if securityID == nil && rawName != nil && *rawName != "" {
		if s.Worker == nil {
			return 0, false, errors.New("issuer resolver unavailable")
		}
		names, err := s.DB.QueryContext(ctx, `SELECT c.id,c.name,s.id FROM market.companies c JOIN market.securities s ON s.company_id=c.id AND s.exchange=$1`, exchange)
		if err != nil {
			return 0, false, err
		}
		companies := []map[string]string{}
		for names.Next() {
			var c, name, id string
			if err = names.Scan(&c, &name, &id); err != nil {
				names.Close()
				return 0, false, err
			}
			companies = append(companies, map[string]string{"companyId": c, "name": name, "securityId": id})
		}
		err = names.Err()
		names.Close()
		if err != nil {
			return 0, false, err
		}
		raw, err := s.Worker.Calculate(ctx, engine.Request{Operation: "resolve_company_entity", Args: []any{*rawName, companies}})
		if err != nil {
			return 0, false, err
		}
		var match *struct {
			CompanyID  string `json:"companyId"`
			SecurityID string `json:"securityId"`
		}
		if json.Unmarshal(raw, &match) != nil {
			return 0, false, errors.New("invalid issuer resolution")
		}
		if match != nil {
			companyID = &match.CompanyID
			securityID = &match.SecurityID
		}
	}
	created := 0
	// Resume individual missing tables after a partial database failure. The
	// existence of one table must not permanently hide the remaining tables.
	existingRows, err := s.DB.QueryContext(ctx, `SELECT table_index FROM market.financial_statement_candidates WHERE scraped_extraction_id=$1`, row.ID)
	if err != nil {
		return 0, securityID != nil, err
	}
	existing := map[int]bool{}
	for existingRows.Next() {
		var index int
		if err = existingRows.Scan(&index); err != nil {
			existingRows.Close()
			return 0, securityID != nil, err
		}
		existing[index] = true
	}
	err = existingRows.Err()
	existingRows.Close()
	if err != nil {
		return 0, securityID != nil, err
	}
	for index, table := range tables {
		if existing[index] {
			continue
		}
		var parsed struct {
			Rows       []json.RawMessage `json:"rows"`
			Confidence *float64          `json:"confidence"`
		}
		if json.Unmarshal(table, &parsed) != nil || parsed.Rows == nil {
			continue
		}
		usable := true
		for _, record := range parsed.Rows {
			var values map[string]json.RawMessage
			if json.Unmarshal(record, &values) != nil {
				usable = false
				break
			}
			var label string
			var cells []json.RawMessage
			// Go accepts JSON null into a string; the source contract requires a
			// literal string label, not a null or an inferred account name.
			labelJSON := values["label"]
			if len(labelJSON) == 0 || labelJSON[0] != '"' || json.Unmarshal(labelJSON, &label) != nil || json.Unmarshal(values["values"], &cells) != nil || cells == nil {
				usable = false
				break
			}
		}
		if !usable {
			continue
		}
		confidence := parsed.Confidence
		if confidence == nil {
			confidence = row.Confidence
		}
		changed, err := upsertCandidateAffected(ctx, s.DB, Candidate{CompanyID: companyID, SecurityID: securityID, RawCompanyName: rawName, Source: row.Source, Exchange: exchange, DocumentURL: row.URL, DocumentTitle: row.Title, TableIndex: index, DetectedTable: table, DetectionConfidence: confidence, ArtifactID: row.ArtifactID, ExtractionID: row.ID})
		if err != nil {
			return created, securityID != nil, err
		}
		if changed {
			created++
		}
	}
	return created, securityID != nil, nil
}
