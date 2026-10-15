package marketdata

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"time"
)

var reviewedEarningsJoin = `LEFT JOIN LATERAL (
 SELECT p.id,p.reported_at,i.eps,i.revenue FROM market.financial_periods p
 JOIN market.income_statements i ON i.period_id=p.id
 WHERE p.security_id=ee.security_id AND p.fiscal_year=ee.fiscal_year
 AND p.fiscal_quarter IS NOT DISTINCT FROM ee.fiscal_quarter
 AND p.period_type=CASE WHEN ee.fiscal_quarter IS NULL THEN 'annual' ELSE 'quarterly' END
 AND p.period_end<=CURRENT_DATE AND p.reported_at<=CURRENT_DATE
 AND ` + reviewedComponentSQL("i", "p", "FALSE", "income", "income_statements") + `
 ORDER BY p.reported_at DESC LIMIT 1) reviewed ON TRUE`

const actionColumns = `ca.id,ca.security_id AS "securityId",ca.type,ca.announced_at AS "announcedAt",ca.ex_date AS "exDate",
 ca.record_date AS "recordDate",ca.pay_date AS "payDate",ca.effective_date AS "effectiveDate",ca.status,ca.details`

func (s *Store) CorporateActions(ctx context.Context, id string) ([]json.RawMessage, error) {
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT `+actionColumns+` FROM market.corporate_actions ca WHERE ca.security_id=$1 ORDER BY ca.announced_at DESC) result`, id)
}
func (s *Store) Dividends(ctx context.Context, id string) ([]json.RawMessage, error) {
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT `+actionColumns+` FROM market.corporate_actions ca WHERE ca.security_id=$1 AND ca.type='dividend' ORDER BY ca.ex_date DESC NULLS LAST) result`, id)
}
func (s *Store) UpcomingDividends(ctx context.Context, exchange string, limit int) ([]json.RawMessage, error) {
	if limit < 1 || limit > 100 {
		return nil, errors.New("invalid dividend read limit")
	}
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT `+actionColumns+`,sec.symbol,c.name AS "companyName"
 FROM market.corporate_actions ca JOIN market.securities sec ON sec.id=ca.security_id JOIN market.companies c ON c.id=sec.company_id
 WHERE ca.type='dividend' AND sec.exchange=$1 AND ca.ex_date>=CURRENT_DATE ORDER BY ca.ex_date ASC LIMIT $2) result`, exchange, limit)
}
func (s *Store) RecentEarnings(ctx context.Context, exchange string, limit int) ([]json.RawMessage, error) {
	if limit < 1 || limit > 100 {
		return nil, errors.New("invalid earnings read limit")
	}
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT ee.id,ee.security_id AS "securityId",ee.period_id AS "periodId",ee.fiscal_year AS "fiscalYear",
 ee.fiscal_quarter AS "fiscalQuarter",CASE WHEN reviewed.id IS NOT NULL THEN reviewed.reported_at ELSE ee.reported_date END AS "reportedDate",
 CASE WHEN reviewed.id IS NOT NULL THEN reviewed.eps ELSE ee.eps_actual END AS "epsActual",
 CASE WHEN reviewed.id IS NOT NULL THEN reviewed.revenue ELSE ee.revenue_actual END AS "revenueActual",sec.symbol,c.name AS "companyName"
 FROM market.earnings_events ee JOIN market.securities sec ON sec.id=ee.security_id JOIN market.companies c ON c.id=sec.company_id `+reviewedEarningsJoin+`
 WHERE sec.exchange=$1 AND sec.status<>'delisted' AND (reviewed.id IS NOT NULL OR ee.reported_date<=CURRENT_DATE)
 ORDER BY COALESCE(reviewed.reported_at,ee.reported_date) DESC LIMIT $2) result`, exchange, limit)
}
func (s *Store) Earnings(ctx context.Context, id string, limit int) ([]json.RawMessage, error) {
	if limit < 1 || limit > 100 {
		return nil, errors.New("invalid earnings read limit")
	}
	rows, err := s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT ee.id,ee.security_id AS "securityId",COALESCE(reviewed.id,ee.period_id) AS "periodId",
 ee.fiscal_year AS "fiscalYear",ee.fiscal_quarter AS "fiscalQuarter",ee.expected_date AS "expectedDate",
 CASE WHEN reviewed.id IS NOT NULL THEN reviewed.reported_at ELSE ee.reported_date END AS "reportedDate",ee.eps_estimate AS "epsEstimate",
 CASE WHEN reviewed.id IS NOT NULL THEN reviewed.eps ELSE ee.eps_actual END AS "epsActual",ee.revenue_estimate AS "revenueEstimate",
 CASE WHEN reviewed.id IS NOT NULL THEN reviewed.revenue ELSE ee.revenue_actual END AS "revenueActual"
 FROM market.earnings_events ee `+reviewedEarningsJoin+` WHERE ee.security_id=$1
 AND (reviewed.id IS NOT NULL OR ee.reported_date IS NULL OR ee.reported_date<=CURRENT_DATE)
 ORDER BY ee.fiscal_year DESC,ee.fiscal_quarter DESC NULLS LAST LIMIT $2) result`, id, limit)
	if err != nil {
		return nil, err
	}
	for i, j := 0, len(rows)-1; i < j; i, j = i+1, j-1 {
		rows[i], rows[j] = rows[j], rows[i]
	}
	return rows, nil
}
func (s *Store) Ownership(ctx context.Context, id string) ([]json.RawMessage, error) {
	return s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT security_id AS "securityId",holder_name AS "holderName",holder_type AS "holderType",
 shares_held AS "sharesHeld",percent_held AS "percentHeld",to_char(as_of AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf"
 FROM market.ownership WHERE security_id=$1 ORDER BY percent_held DESC) result`, id)
}

type CorporateAction struct {
	ID            string          `json:"id"`
	SecurityID    string          `json:"securityId"`
	Type          string          `json:"type"`
	AnnouncedAt   string          `json:"announcedAt"`
	Status        string          `json:"status"`
	ExDate        *string         `json:"exDate"`
	RecordDate    *string         `json:"recordDate"`
	PayDate       *string         `json:"payDate"`
	EffectiveDate *string         `json:"effectiveDate"`
	Details       json.RawMessage `json:"details"`
}

func (s *Store) UpsertCorporateAction(ctx context.Context, a CorporateAction) error {
	_, err := s.UpsertCorporateActionChanged(ctx, a)
	return err
}

func (s *Store) UpsertCorporateActionChanged(ctx context.Context, a CorporateAction) (bool, error) {
	if err := a.Validate(time.Now().UTC()); err != nil {
		return false, err
	}
	if !json.Valid(a.Details) {
		return false, errors.New("invalid corporate action evidence")
	}
	result, err := s.DB.ExecContext(ctx, `INSERT INTO market.corporate_actions(id,security_id,type,announced_at,ex_date,record_date,pay_date,effective_date,status,details)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,details=EXCLUDED.details,updated_at=now() WHERE (corporate_actions.status,corporate_actions.details) IS DISTINCT FROM (EXCLUDED.status,EXCLUDED.details)`,
		a.ID, a.SecurityID, a.Type, a.AnnouncedAt, a.ExDate, a.RecordDate, a.PayDate, a.EffectiveDate, a.Status, string(a.Details))
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	return count > 0, err
}

type EarningsEvent struct {
	ID              string   `json:"id"`
	SecurityID      string   `json:"securityId"`
	PeriodID        *string  `json:"periodId"`
	FiscalYear      int      `json:"fiscalYear"`
	FiscalQuarter   *int     `json:"fiscalQuarter"`
	ExpectedDate    *string  `json:"expectedDate"`
	ReportedDate    *string  `json:"reportedDate"`
	EPSEstimate     *float64 `json:"epsEstimate"`
	EPSActual       *float64 `json:"epsActual"`
	RevenueEstimate *float64 `json:"revenueEstimate"`
	RevenueActual   *float64 `json:"revenueActual"`
}

func (s *Store) UpsertEarningsEvent(ctx context.Context, e EarningsEvent) error {
	if err := e.Validate(time.Now().UTC()); err != nil {
		return err
	}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO market.earnings_events(id,security_id,period_id,fiscal_year,fiscal_quarter,expected_date,reported_date,eps_estimate,eps_actual,revenue_estimate,revenue_actual)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET reported_date=EXCLUDED.reported_date,eps_actual=EXCLUDED.eps_actual,revenue_actual=EXCLUDED.revenue_actual`,
		e.ID, e.SecurityID, e.PeriodID, e.FiscalYear, e.FiscalQuarter, e.ExpectedDate, e.ReportedDate, e.EPSEstimate, e.EPSActual, e.RevenueEstimate, e.RevenueActual)
	return err
}

type OwnershipRecord struct {
	SecurityID  string  `json:"securityId"`
	HolderName  string  `json:"holderName"`
	HolderType  string  `json:"holderType"`
	AsOf        string  `json:"asOf"`
	SharesHeld  float64 `json:"sharesHeld"`
	PercentHeld float64 `json:"percentHeld"`
}

func (s *Store) UpsertOwnership(ctx context.Context, records []OwnershipRecord) error {
	if len(records) > 1000 {
		return errors.New("ownership write batch exceeds limit")
	}
	now := time.Now().UTC()
	seen := map[string]bool{}
	for _, record := range records {
		if err := record.Validate(now); err != nil {
			return err
		}
		key := record.SecurityID + "|" + record.HolderName
		if seen[key] {
			return errors.New("duplicate holder identity")
		}
		seen[key] = true
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, r := range records {
		_, err = tx.ExecContext(ctx, `INSERT INTO market.ownership(security_id,holder_name,holder_type,shares_held,percent_held,as_of)
 VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(security_id,holder_name) DO UPDATE SET shares_held=EXCLUDED.shares_held,percent_held=EXCLUDED.percent_held,as_of=EXCLUDED.as_of`, r.SecurityID, r.HolderName, r.HolderType, r.SharesHeld, r.PercentHeld, r.AsOf)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) AdjustmentsSince(ctx context.Context, id, since string) ([]json.RawMessage, error) {
	date, err := actionDate(since)
	if err != nil {
		return nil, err
	}
	return s.JSONRowsBounded(ctx, 1024*1024, `SELECT row_to_json(result) FROM (SELECT `+actionColumns+` FROM market.corporate_actions ca WHERE ca.security_id=$1 AND ca.announced_at>=$2::date AND ca.type IN('split','bonus_issue','dividend') ORDER BY ca.announced_at DESC) result`, id, date)
}

func (s *Store) ShareAdjustmentFactor(ctx context.Context, id, since string) (float64, error) {
	rows, err := s.AdjustmentsSince(ctx, id, since)
	if err != nil {
		return 0, err
	}
	factor := 1.0
	for _, raw := range rows {
		var row struct {
			Details struct {
				Type      string   `json:"type"`
				RatioFrom *float64 `json:"ratioFrom"`
				RatioTo   *float64 `json:"ratioTo"`
			} `json:"details"`
		}
		if json.Unmarshal(raw, &row) != nil {
			return 0, errors.New("invalid source adjustment")
		}
		if row.Details.Type != "split" && row.Details.Type != "bonus_issue" {
			continue
		}
		from, to := row.Details.RatioFrom, row.Details.RatioTo
		if from == nil || to == nil || *from <= 0 || *to <= 0 || math.IsNaN(*from) || math.IsNaN(*to) || math.IsInf(*from, 0) || math.IsInf(*to, 0) {
			return 0, errors.New("share adjustment ratio unavailable")
		}
		factor *= *to / *from
		if math.IsNaN(factor) || math.IsInf(factor, 0) {
			return 0, errors.New("share adjustment exceeds numerical range")
		}
	}
	return factor, nil
}
