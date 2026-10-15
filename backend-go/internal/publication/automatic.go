package publication

import (
	"context"
	"continua/backend/internal/engine"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"sort"
	"strings"
)

// Same registered layout semantics as the compatibility validator. Native
// implementation tests versioned separately by the release ledger.
const DocumentValidatorVersion = "consolidated-native-annual-v1:safaricom-condensed-group-v1:safaricom-native-bn-comparatives-v1:kakuzi-group-annual-v1:kcb-six-column-group-2017-v1:kakuzi-five-year-html-2025-v1:canonical-nse-v6:cbk-reopened-v1"

const pendingDocumentsSQL = `SELECT e.id
 FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
 JOIN scraping.sources s ON s.id=a.source_id WHERE s.enabled
 AND (a.content_type LIKE '%application/pdf%' OR (a.source_id='kakuzi-record-filings' AND a.content_type LIKE '%text/html%'))
 AND a.sha256 ~ '^[a-f0-9]{64}$' AND e.text IS NOT NULL
 AND (a.source_id='nse' OR a.source_id='cbk-bond-history' OR a.source_id='kenyanstocks' OR a.source_id LIKE '%-filings')
 AND ($3::bigint[] IS NULL OR e.id=ANY($3))
 AND NOT EXISTS(SELECT 1 FROM scraping.extractions newer WHERE newer.artifact_id=e.artifact_id
 AND (newer.extracted_at>e.extracted_at OR (newer.extracted_at=e.extracted_at AND newer.id>e.id)))
 AND NOT EXISTS(SELECT 1 FROM market.document_validations v WHERE v.extraction_id=e.id AND v.validator_version=$1)
 ORDER BY e.id ASC LIMIT $2`

type document struct {
	ID, ArtifactID                    int64
	Method, Text                      string
	Tables                            json.RawMessage
	NeedsReview                       bool
	ObservedDate, SHA256, URL, Source string
	Title                             *string
	Config                            json.RawMessage
}
type issuer struct {
	ID        string `json:"id"`
	CompanyID string `json:"company_id"`
	Name      string `json:"name"`
}
type plannedEntry struct {
	Table        json.RawMessage `json:"table"`
	Confirmation json.RawMessage `json:"confirmation"`
}
type bondRecord struct {
	ID         string          `json:"id"`
	Kind       string          `json:"kind"`
	Title      string          `json:"title"`
	Symbol     string          `json:"symbol"`
	ObservedAt string          `json:"observedAt"`
	SourceURL  string          `json:"sourceUrl"`
	Payload    json.RawMessage `json:"payload"`
}
type documentPlan struct {
	Valid   bool           `json:"valid"`
	Reason  string         `json:"reason"`
	Kind    string         `json:"kind"`
	Issuer  issuer         `json:"issuer"`
	Entries []plannedEntry `json:"entries"`
	Records []bondRecord   `json:"records"`
}
type AutomaticSummary struct {
	Published     int `json:"published"`
	Review        int `json:"review"`
	Failed        int `json:"failed"`
	RefreshFailed int `json:"refreshFailed,omitempty"`
}

func (s *Service) AutomaticDocuments(ctx context.Context, limit int, extractionIDs []int64) (*AutomaticSummary, error) {
	if s.DB == nil || s.Worker == nil || s.DocumentWorker == nil || limit < 1 || limit > 100 {
		return nil, errors.New("invalid native publication configuration")
	}
	if len(extractionIDs) > 100 {
		return nil, errors.New("extraction batch too large")
	}
	for _, id := range extractionIDs {
		if id < 1 {
			return nil, errors.New("invalid extraction id")
		}
	}
	var ids any
	if extractionIDs != nil {
		ids = extractionIDs
	}
	rows, err := s.DB.QueryContext(ctx, pendingDocumentsSQL, DocumentValidatorVersion, limit, ids)
	if err != nil {
		return nil, err
	}
	documents := []int64{}
	for rows.Next() {
		var id int64
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		documents = append(documents, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	summary := &AutomaticSummary{}
	changed := map[string]string{}
	// Each transaction independently takes the per-extraction advisory lock,
	// protecting concurrent workers and restarted replicas, not only this process.
	for _, d := range documents {
		outcome, company, e := s.publishDocument(ctx, d)
		if e != nil {
			summary.Failed++
			continue
		}
		switch outcome {
		case "published":
			summary.Published++
		case "review":
			summary.Review++
		}
		if company != nil {
			changed[company.ID] = strings.TrimPrefix(company.ID, "NSE:")
		}
	}
	for id, symbol := range changed {
		if s.DurableRefresh {
			continue
		} // Transactional outbox owns recovery.
		if s.RefreshResearch == nil || s.RefreshResearch(ctx, id, symbol) != nil {
			summary.RefreshFailed++
		}
	}
	return summary, nil
}

func (s *Service) publishDocument(ctx context.Context, id int64) (string, *issuer, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return "", nil, err
	}
	defer tx.Rollback()
	var locked bool
	if err = tx.QueryRowContext(ctx, `SELECT pg_try_advisory_xact_lock(hashtextextended('document-validation:' || $1::text,0)) AS locked`, id).Scan(&locked); err != nil {
		return "", nil, err
	}
	if !locked {
		return "", nil, nil
	}
	var exists int
	err = tx.QueryRowContext(ctx, `SELECT 1 FROM market.document_validations WHERE extraction_id=$1 AND validator_version=$2`, id, DocumentValidatorVersion).Scan(&exists)
	if err == nil {
		return "", nil, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", nil, err
	}
	// Retrieve only one body after taking its lease. The ID scan above is tiny,
	// even when the archive contains many multi-megabyte extractions. Re-check
	// immutable-version freshness and source enablement after waiting for a lock.
	var d document
	var tables, config []byte
	err = tx.QueryRowContext(ctx, `SELECT e.id,e.artifact_id,e.method,e.text,e.tables,e.needs_review,
 (e.extracted_at AT TIME ZONE 'UTC')::date::text,a.sha256,a.document_url,a.source_id,a.title,s.config
 FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id JOIN scraping.sources s ON s.id=a.source_id
 WHERE e.id=$1 AND s.enabled AND NOT EXISTS(SELECT 1 FROM scraping.extractions newer WHERE newer.artifact_id=e.artifact_id
 AND (newer.extracted_at>e.extracted_at OR (newer.extracted_at=e.extracted_at AND newer.id>e.id)))`, id).Scan(&d.ID, &d.ArtifactID, &d.Method, &d.Text, &tables, &d.NeedsReview, &d.ObservedDate, &d.SHA256, &d.URL, &d.Source, &d.Title, &config)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil, nil
	}
	if err != nil {
		return "", nil, err
	}
	d.Tables = tables
	d.Config = config
	names, err := tx.QueryContext(ctx, `SELECT s.id,s.company_id,c.name FROM market.securities s JOIN market.companies c ON c.id=s.company_id WHERE s.exchange='NSE' AND s.status='active' AND (lower(c.name) NOT LIKE 'safaricom%' OR s.symbol='SCOM')`)
	if err != nil {
		return "", nil, err
	}
	issuers := []issuer{}
	for names.Next() {
		var i issuer
		if err = names.Scan(&i.ID, &i.CompanyID, &i.Name); err != nil {
			names.Close()
			return "", nil, err
		}
		issuers = append(issuers, i)
	}
	err = names.Err()
	names.Close()
	if err != nil {
		return "", nil, err
	}
	raw, err := s.DocumentWorker.Calculate(ctx, engine.Request{Operation: "document_publication_plan", Args: []any{map[string]any{
		"method": d.Method, "text": d.Text, "tables": d.Tables, "needsReview": d.NeedsReview, "observedDate": d.ObservedDate, "sourceUrl": d.URL, "sourceId": d.Source, "config": d.Config}, issuers}})
	if err != nil {
		return "", nil, err
	} // Runtime outage is retryable, not a reviewed source.
	var plan documentPlan
	if json.Unmarshal(raw, &plan) != nil {
		return "", nil, errors.New("invalid document worker response")
	}
	outcome, reason := "review", plan.Reason
	result := map[string]any{}
	var changed *issuer
	if _, err = tx.ExecContext(ctx, "SAVEPOINT canonical_publication"); err != nil {
		return "", nil, err
	}
	if plan.Valid {
		result, err = s.applyPlan(ctx, tx, d, plan)
		if err != nil {
			var review *Error
			if !errors.As(err, &review) {
				return "", nil, err
			} // SQL/pool failure remains retryable.
			if _, err = tx.ExecContext(ctx, "ROLLBACK TO SAVEPOINT canonical_publication"); err != nil {
				return "", nil, err
			}
			reason = review.Message
			result = map[string]any{}
		} else {
			outcome = "published"
			reason = "Registered source template and accounting checks passed; canonical records published without restatement"
			if plan.Kind == "financial" {
				changed = &plan.Issuer
			}
		}
	}
	if reason == "" {
		reason = "Validation requires review"
	}
	if len(reason) > 400 {
		reason = reason[:400]
	}
	resultJSON, err := json.Marshal(result)
	if err != nil {
		return "", nil, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO market.document_validations(extraction_id,validator_version,artifact_sha256,source_url,outcome,reason,result) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`, d.ID, DocumentValidatorVersion, d.SHA256, d.URL, outcome, reason, string(resultJSON))
	if err != nil {
		return "", nil, err
	}
	if err = tx.Commit(); err != nil {
		return "", nil, err
	}
	return outcome, changed, nil
}

func (s *Service) applyPlan(ctx context.Context, tx *sql.Tx, d document, plan documentPlan) (map[string]any, error) {
	if plan.Kind == "bond" {
		if len(plan.Records) == 0 {
			return nil, errors.New("empty bond publication plan")
		}
		// All records take locks in stable order, including absent rows. Merely
		// locking existing rows does not prevent simultaneous conflicting inserts.
		records := append([]bondRecord(nil), plan.Records...)
		sort.Slice(records, func(i, j int) bool { return records[i].ID < records[j].ID })
		for i, r := range records {
			if r.ID == "" || (i > 0 && records[i-1].ID == r.ID) {
				return nil, errors.New("invalid duplicate bond observation")
			}
			if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, "bond-publication:"+r.ID); err != nil {
				return nil, err
			}
		}
		for _, r := range records {
			var source string
			var payload []byte
			err := tx.QueryRowContext(ctx, `SELECT source_url,payload FROM market.research_records WHERE id=$1 FOR UPDATE`, r.ID).Scan(&source, &payload)
			if err != nil && !errors.Is(err, sql.ErrNoRows) {
				return nil, err
			}
			if err == nil {
				var old, current map[string]any
				if json.Unmarshal(payload, &old) != nil || json.Unmarshal(r.Payload, &current) != nil {
					return nil, errors.New("invalid stored bond evidence")
				}
				conflict := source != r.SourceURL
				for key, v := range current {
					if !reflect.DeepEqual(old[key], v) {
						conflict = true
					}
				}
				if conflict {
					return nil, &Error{409, "Existing bond observation conflicts; review required"}
				}
			}
		}
		ids := []string{}
		for _, r := range plan.Records {
			_, err := tx.ExecContext(ctx, `INSERT INTO market.research_records(id,kind,title,symbol,observed_at,source_url,payload,verified_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,now()) ON CONFLICT(id) DO NOTHING`, r.ID, r.Kind, r.Title, r.Symbol, r.ObservedAt, r.SourceURL, string(r.Payload))
			if err != nil {
				return nil, err
			}
			ids = append(ids, r.ID)
		}
		return map[string]any{"recordIds": ids}, nil
	}
	if plan.Kind != "financial" || len(plan.Entries) == 0 || plan.Issuer.ID == "" {
		return nil, errors.New("invalid financial publication plan")
	}
	ids := []string{}
	for index, entry := range plan.Entries {
		tableIndex := 100000 + index
		var id, status string
		err := tx.QueryRowContext(ctx, `SELECT id::text,status FROM market.financial_statement_candidates WHERE scraped_extraction_id=$1 AND table_index=$2`, d.ID, tableIndex).Scan(&id, &status)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
		if status == "confirmed" {
			ids = append(ids, id)
			continue
		}
		if status == "rejected" {
			return nil, &Error{409, "Previously rejected auto candidate requires review"}
		}
		body, err := s.validate(ctx, entry.Confirmation)
		if err != nil {
			return nil, err
		}
		if body.SecurityID == nil || *body.SecurityID != plan.Issuer.ID {
			return nil, errors.New("publication issuer mismatch")
		}
		confidence := 1.0
		if err = UpsertCandidate(ctx, tx, Candidate{CompanyID: &plan.Issuer.CompanyID, SecurityID: &plan.Issuer.ID, RawCompanyName: &plan.Issuer.Name, Source: d.Source, Exchange: "NSE", DocumentURL: d.URL, DocumentTitle: d.Title, TableIndex: tableIndex, DetectedTable: entry.Table, DetectionConfidence: &confidence, ArtifactID: d.ArtifactID, ExtractionID: d.ID}); err != nil {
			return nil, err
		}
		if err = tx.QueryRowContext(ctx, `SELECT id::text FROM market.financial_statement_candidates WHERE scraped_extraction_id=$1 AND table_index=$2`, d.ID, tableIndex).Scan(&id); err != nil {
			return nil, err
		}
		if _, err = s.Publish(ctx, tx, id, body); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return map[string]any{"candidateIds": ids}, nil
}

func (s AutomaticSummary) String() string {
	return fmt.Sprintf("published=%d review=%d failed=%d", s.Published, s.Review, s.Failed)
}
