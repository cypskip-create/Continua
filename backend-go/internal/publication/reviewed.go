package publication

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/url"
	"regexp"
	"strconv"
)

type reviewedTable struct {
	Title      string `json:"title"`
	HeaderLine string `json:"headerLine"`
	Rows       []struct {
		Label  string   `json:"label"`
		Values []string `json:"values"`
	} `json:"rows"`
}

type reviewedEntry struct {
	TableIndex   int             `json:"tableIndex"`
	Table        reviewedTable   `json:"table"`
	Confirmation json.RawMessage `json:"confirmation"`
}

type reviewedFiling struct {
	ArtifactID        int64           `json:"artifactId"`
	SHA256            string          `json:"sha256"`
	DocumentURL       string          `json:"documentUrl"`
	IdentitySourceURL string          `json:"identitySourceUrl"`
	Entries           []reviewedEntry `json:"entries"`
}

type ReviewedResult struct {
	Mode            string    `json:"mode"`
	ArtifactID      int64     `json:"artifactId"`
	Published       []*Result `json:"published"`
	AlreadyReviewed []string  `json:"alreadyReviewed"`
}

func publicEvidenceURL(value string) bool {
	u, err := url.Parse(value)
	return err == nil && len(value) <= 4096 && u.Scheme == "https" && u.Hostname() != "" && u.User == nil && u.Fragment == ""
}

// ReviewedFiling preserves the explicit human transcription workflow. Validation
// rolls back by default. All tables share one transaction so a later conflict
// cannot leave a half-published filing. It never invokes OCR or a paid provider.
func (s *Service) ReviewedFiling(ctx context.Context, raw json.RawMessage, apply bool) (*ReviewedResult, error) {
	if s.DB == nil || s.Worker == nil || len(raw) > 1048576 {
		return nil, ErrInvalidConfirmation
	}
	var input reviewedFiling
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil || decoder.Decode(new(any)) != io.EOF || input.ArtifactID < 1 || !regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(input.SHA256) || !publicEvidenceURL(input.DocumentURL) || !publicEvidenceURL(input.IdentitySourceURL) || len(input.Entries) < 1 || len(input.Entries) > 100 {
		return nil, ErrInvalidConfirmation
	}
	confirmations := make([]Confirmation, len(input.Entries))
	seen := map[int]bool{}
	for i, entry := range input.Entries {
		if entry.TableIndex < 0 || entry.TableIndex > 10000 || seen[entry.TableIndex] || len(entry.Table.Title) > 4000 || len(entry.Table.HeaderLine) > 16000 || len(entry.Table.Rows) < 1 || len(entry.Table.Rows) > 1000 {
			return nil, ErrInvalidConfirmation
		}
		seen[entry.TableIndex] = true
		for _, row := range entry.Table.Rows {
			if len(row.Label) == 0 || len(row.Label) > 4000 || len(row.Values) < 1 || len(row.Values) > 100 {
				return nil, ErrInvalidConfirmation
			}
			for _, value := range row.Values {
				if len(value) > 4000 {
					return nil, ErrInvalidConfirmation
				}
			}
		}
		body, err := s.validate(ctx, entry.Confirmation)
		if err != nil {
			return nil, err
		}
		if body.SecurityID == nil {
			return nil, ErrInvalidConfirmation
		}
		maxColumns := 0
		for _, row := range entry.Table.Rows {
			if len(row.Values) > maxColumns {
				maxColumns = len(row.Values)
			}
		}
		for _, column := range body.Periods {
			if column.ColumnIndex < 0 || column.ColumnIndex >= maxColumns {
				return nil, ErrInvalidConfirmation
			}
		}
		confirmations[i] = body
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var extractionID int64
	var source, title string
	// Immutable source hash and private original are mandatory. Lock the source
	// permission row for this entire publication transaction.
	err = tx.QueryRowContext(ctx, `SELECT e.id,a.source_id,COALESCE(a.title,'')
 FROM scraping.raw_artifacts a JOIN scraping.sources s ON s.id=a.source_id
 JOIN LATERAL (SELECT id FROM scraping.extractions WHERE artifact_id=a.id ORDER BY extracted_at DESC,id DESC LIMIT 1) e ON true
 WHERE a.id=$1 AND a.sha256=$2 AND a.document_url=$3
	 AND a.storage_path LIKE 'r2://continua-financial-documents/%' AND s.enabled=true
	 AND s.redistribution_allowed=true
 AND length(trim(COALESCE(s.config->>'permissionReference',''))) BETWEEN 1 AND 200
 FOR SHARE OF a,s`, input.ArtifactID, input.SHA256, input.DocumentURL).Scan(&extractionID, &source, &title)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, &Error{422, "Reviewed source provenance or permission unavailable"}
	}
	if err != nil {
		return nil, err
	}
	result := &ReviewedResult{Mode: "validated", ArtifactID: input.ArtifactID, Published: []*Result{}, AlreadyReviewed: []string{}}
	if apply {
		result.Mode = "published"
	}
	for i, entry := range input.Entries {
		body := confirmations[i]
		var companyID string
		if err = tx.QueryRowContext(ctx, `SELECT company_id FROM market.securities WHERE id=$1 AND exchange='NSE' AND status='active'`, *body.SecurityID).Scan(&companyID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, &Error{422, "Reviewed issuer must resolve to an active NSE security"}
			}
			return nil, err
		}
		// Serialize the absent-row case too; ON CONFLICT must not replace an
		// automated pending or rejected candidate with a human transcription.
		lock := "reviewed-transcription:" + strconv.FormatInt(extractionID, 10) + ":" + strconv.Itoa(entry.TableIndex)
		if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, lock); err != nil {
			return nil, err
		}
		var candidateID, status string
		err = tx.QueryRowContext(ctx, `SELECT id::text,status FROM market.financial_statement_candidates WHERE scraped_extraction_id=$1 AND table_index=$2 FOR UPDATE`, extractionID, entry.TableIndex).Scan(&candidateID, &status)
		if err == nil {
			if status == "confirmed" {
				result.AlreadyReviewed = append(result.AlreadyReviewed, candidateID)
				continue
			}
			return nil, &Error{409, "Existing automated candidate requires separate review"}
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
		if !apply {
			continue
		}
		table, marshalErr := json.Marshal(map[string]any{"title": entry.Table.Title, "headerLine": entry.Table.HeaderLine, "rows": entry.Table.Rows, "method": "operator_visual_transcription", "confidence": 1, "identitySourceUrl": input.IdentitySourceURL})
		if marshalErr != nil {
			return nil, ErrInvalidConfirmation
		}
		// DO NOTHING plus RETURNING detects a concurrent automatic bridge without
		// changing its evidence. No unrestricted upsert is used here.
		err = tx.QueryRowContext(ctx, `INSERT INTO market.financial_statement_candidates
 (company_id,security_id,raw_company_name,source,exchange,document_url,document_title,table_index,detected_table,detection_confidence,scraped_artifact_id,scraped_extraction_id)
 VALUES($1,$2,$3,$4,'NSE',$5,$3,$6,$7::jsonb,1,$8,$9)
 ON CONFLICT(scraped_extraction_id,table_index) DO NOTHING RETURNING id::text`, companyID, *body.SecurityID, title, source, input.DocumentURL, entry.TableIndex, string(table), input.ArtifactID, extractionID).Scan(&candidateID)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, &Error{409, "Candidate arrived during review; retry separate review"}
		}
		if err != nil {
			return nil, err
		}
		published, publishErr := s.Publish(ctx, tx, candidateID, body)
		if publishErr != nil {
			return nil, publishErr
		}
		result.Published = append(result.Published, published)
	}
	if apply {
		if err = tx.Commit(); err != nil {
			return nil, err
		}
	}
	return result, nil
}
