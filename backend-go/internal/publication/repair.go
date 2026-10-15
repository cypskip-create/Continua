package publication

import (
	"context"
	"continua/backend/internal/engine"
	"database/sql"
	"encoding/json"
	"errors"
	"net/url"
)

// RepairCondensed preserves the narrowly scoped operator repair of a legacy
// future-dated SCOM bundle. A currently valid bundle is never archived/replaced
// by this exception. The parser, archive and reviewed writes are all explicit.
func (s *Service) RepairCondensed(ctx context.Context, extractionID int64, apply bool) (map[string]any, error) {
	if extractionID < 1 || s.DB == nil || s.Worker == nil || s.DocumentWorker == nil {
		return nil, &Error{400, "Reviewed extraction and native document worker required"}
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var d document
	err = tx.QueryRowContext(ctx, `SELECT e.id,e.artifact_id,e.text,a.document_url,a.title,a.source_id
 FROM scraping.extractions e JOIN scraping.raw_artifacts a ON a.id=e.artifact_id
 JOIN scraping.sources src ON src.id=a.source_id
 WHERE e.id=$1 AND e.method='native_pdf_text' AND a.source_id='nse'
 AND a.sha256 ~ '^[a-f0-9]{64}$' AND a.storage_path LIKE 'r2://continua-financial-documents/%'
 AND octet_length(e.text)<=8388608 AND src.enabled AND src.redistribution_allowed=true
 AND length(trim(src.config->>'permissionReference')) BETWEEN 1 AND 200 FOR SHARE OF a,src`, extractionID).Scan(&d.ID, &d.ArtifactID, &d.Text, &d.URL, &d.Title, &d.Source)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, &Error{422, "Reviewed official source unavailable"}
	}
	if err != nil {
		return nil, err
	}
	u, err := url.Parse(d.URL)
	if err != nil || u.Scheme != "https" || u.Hostname() != "www.nse.co.ke" || u.User != nil {
		return nil, &Error{422, "Reviewed official source unavailable"}
	}
	raw, err := s.DocumentWorker.Calculate(ctx, engine.Request{Operation: "condensed_group_report", Args: []any{d.Text, "Safaricom Plc", "NSE:SCOM"}})
	if err != nil {
		return nil, err
	}
	var entries []plannedEntry
	if json.Unmarshal(raw, &entries) != nil || len(entries) == 0 || len(entries) > 10 {
		return nil, ErrInvalidConfirmation
	}
	plan := documentPlan{Valid: true, Kind: "financial", Issuer: issuer{ID: "NSE:SCOM", Name: "Safaricom Plc"}, Entries: entries}
	var replacement *Period
	for _, entry := range entries {
		body, err := s.validate(ctx, entry.Confirmation)
		if err != nil {
			return nil, err
		}
		if body.SecurityID == nil || *body.SecurityID != "NSE:SCOM" {
			return nil, ErrInvalidConfirmation
		}
		for _, column := range body.Periods {
			if column.Period.FiscalYear != 2026 {
				continue
			}
			if replacement != nil && (replacement.PeriodEnd != column.Period.PeriodEnd || replacement.ReportedAt != column.Period.ReportedAt) {
				return nil, ErrInvalidConfirmation
			}
			period := column.Period
			replacement = &period
		}
	}
	if replacement == nil {
		return nil, &Error{422, "Reviewed replacement period unavailable"}
	}
	if err = tx.QueryRowContext(ctx, `SELECT company_id FROM market.securities WHERE id='NSE:SCOM' AND exchange='NSE' AND status='active'`).Scan(&plan.Issuer.CompanyID); err != nil {
		return nil, err
	}
	result := map[string]any{"mode": "validated", "extractionId": extractionID, "applied": false}
	if !apply {
		return result, nil
	}
	if _, err = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext('canonical-research:NSE:SCOM'))`); err != nil {
		return nil, err
	}
	var legacy []byte
	err = tx.QueryRowContext(ctx, `SELECT to_jsonb(p)||jsonb_build_object('income',to_jsonb(i),'balance',to_jsonb(b),'cashflow',to_jsonb(c))
 FROM market.financial_periods p LEFT JOIN market.income_statements i ON i.period_id=p.id
 LEFT JOIN market.balance_sheets b ON b.period_id=p.id LEFT JOIN market.cash_flow_statements c ON c.period_id=p.id
 WHERE p.id='NSE:period:SCOM:2026' AND (p.period_end>CURRENT_DATE OR p.reported_at>CURRENT_DATE) FOR UPDATE OF p`).Scan(&legacy)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	if len(legacy) > 0 {
		if _, err = tx.ExecContext(ctx, `INSERT INTO market.invalid_filing_archive(period_id,reason,original_bundle,replacement_source_url)
 VALUES('NSE:period:SCOM:2026','Future-dated legacy financial bundle; explicit reviewed native repair',$1::jsonb,$2) ON CONFLICT(period_id) DO NOTHING`, string(legacy), d.URL); err != nil {
			return nil, err
		}
		var archivedURL string
		if err = tx.QueryRowContext(ctx, `SELECT replacement_source_url FROM market.invalid_filing_archive WHERE period_id='NSE:period:SCOM:2026' FOR UPDATE`).Scan(&archivedURL); err != nil {
			return nil, err
		}
		if archivedURL != d.URL {
			return nil, &Error{409, "Existing archive belongs to a different reviewed source"}
		}
		if _, err = tx.ExecContext(ctx, `UPDATE market.financial_periods SET period_end=$1,reported_at=$2 WHERE id='NSE:period:SCOM:2026'`, replacement.PeriodEnd, replacement.ReportedAt); err != nil {
			return nil, err
		}
	}
	var archived bool
	if err = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM market.invalid_filing_archive WHERE period_id='NSE:period:SCOM:2026' AND replacement_source_url=$1)`, d.URL).Scan(&archived); err != nil {
		return nil, err
	}
	if !archived {
		return nil, &Error{409, "No invalid legacy bundle archived; current filing is protected"}
	}
	for i, entry := range plan.Entries {
		var body Confirmation
		if json.Unmarshal(entry.Confirmation, &body) != nil {
			return nil, ErrInvalidConfirmation
		}
		for j, column := range body.Periods {
			if column.Period.FiscalYear == 2026 {
				body.Periods[j].AllowRestatement = true
			}
		}
		plan.Entries[i].Confirmation, err = json.Marshal(body)
		if err != nil {
			return nil, err
		}
	}
	receipt, err := s.applyPlan(ctx, tx, d, plan)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	result["mode"] = "published"
	result["applied"] = true
	result["receipt"] = receipt
	return result, nil
}
