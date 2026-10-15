package marketdata

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
)

type FinancialPeriodInput struct {
	ID            string `json:"id"`
	SecurityID    string `json:"securityId"`
	PeriodType    string `json:"periodType"`
	FiscalYear    int    `json:"fiscalYear"`
	FiscalQuarter *int   `json:"fiscalQuarter"`
	PeriodEnd     string `json:"periodEnd"`
	ReportedAt    string `json:"reportedAt"`
	Currency      string `json:"currency"`
}

var financialWriteFields = map[string][]scoreField{
	"income_statements":    {{"revenue", "revenue"}, {"costOfRevenue", "cost_of_revenue"}, {"grossProfit", "gross_profit"}, {"operatingExpenses", "operating_expenses"}, {"operatingIncome", "operating_income"}, {"netIncome", "net_income"}, {"eps", "eps"}, {"dilutedEps", "diluted_eps"}, {"ebitda", "ebitda"}},
	"balance_sheets":       {{"totalAssets", "total_assets"}, {"totalLiabilities", "total_liabilities"}, {"totalEquity", "total_equity"}, {"cash", "cash"}, {"totalDebt", "total_debt"}, {"currentAssets", "current_assets"}, {"currentLiabilities", "current_liabilities"}, {"sharesOutstanding", "shares_outstanding"}},
	"cash_flow_statements": {{"operatingCashFlow", "operating_cash_flow"}, {"investingCashFlow", "investing_cash_flow"}, {"financingCashFlow", "financing_cash_flow"}, {"freeCashFlow", "free_cash_flow"}, {"capex", "capex"}},
}

func financialValues(raw json.RawMessage, id, table string) (map[string]*float64, error) {
	var input map[string]json.RawMessage
	if len(raw) > 65536 || json.Unmarshal(raw, &input) != nil || input == nil {
		return nil, errors.New("invalid financial component")
	}
	var period string
	if json.Unmarshal(input["periodId"], &period) != nil || period != id {
		return nil, errors.New("financial component period mismatch")
	}
	fields := financialWriteFields[table]
	allowed := map[string]bool{"periodId": true}
	out := map[string]*float64{}
	for _, f := range fields {
		allowed[f.json] = true
		var v *float64
		if b := input[f.json]; b != nil && json.Unmarshal(b, &v) != nil {
			return nil, errors.New("invalid literal financial value")
		}
		if v != nil && (math.IsNaN(*v) || math.IsInf(*v, 0)) {
			return nil, errors.New("nonfinite financial value")
		}
		out[f.json] = v
	}
	for key := range input {
		if !allowed[key] {
			return nil, errors.New("unknown financial field")
		}
	}
	return out, nil
}
func writeFinancialComponent(ctx context.Context, tx *sql.Tx, id, table string, values map[string]*float64) error {
	fields := financialWriteFields[table]
	if len(fields) == 0 {
		return errors.New("invalid financial table")
	}
	columns, parameters, updates, left, right := []string{"period_id"}, []string{"$1"}, []string{}, []string{}, []string{}
	args := []any{id}
	for _, f := range fields {
		columns = append(columns, f.sql)
		args = append(args, values[f.json])
		parameters = append(parameters, fmt.Sprintf("$%d", len(args)))
		updates = append(updates, f.sql+"=EXCLUDED."+f.sql)
		left = append(left, table+"."+f.sql)
		right = append(right, "EXCLUDED."+f.sql)
	}
	_, e := tx.ExecContext(ctx, `INSERT INTO market.`+table+` (`+strings.Join(columns, ",")+`) VALUES (`+strings.Join(parameters, ",")+`) ON CONFLICT(period_id) DO UPDATE SET `+strings.Join(updates, ",")+` WHERE (`+strings.Join(left, ",")+`) IS DISTINCT FROM (`+strings.Join(right, ",")+`)`, args...)
	return e
}

// New adapter periods remain unreviewed, hence invisible to production readers.
// A feed is never allowed to silently replace a reviewed filing/restatement.
// Such changes must pass the audited source-backed publication service.
func (s *Store) UpsertPeriodBundle(ctx context.Context, p FinancialPeriodInput, income, balance, cashflow json.RawMessage, now time.Time) error {
	if p.ID == "" || len(p.ID) > 180 || !strings.HasPrefix(p.SecurityID, "NSE:") || p.Currency != "KES" || !map[string]bool{"annual": true, "quarterly": true}[p.PeriodType] || p.FiscalYear < 1900 || p.FiscalYear > now.UTC().Year() || (p.FiscalQuarter != nil && (*p.FiscalQuarter < 1 || *p.FiscalQuarter > 4)) {
		return errors.New("invalid financial period identity")
	}
	end, e1 := time.Parse("2006-01-02", p.PeriodEnd)
	reported, e2 := time.Parse("2006-01-02", p.ReportedAt)
	if e1 != nil || e2 != nil || reported.Before(end) || p.PeriodEnd > now.UTC().Format("2006-01-02") || p.ReportedAt > now.UTC().Format("2006-01-02") {
		return errors.New("invalid financial availability dates")
	}
	if (p.PeriodType == "annual" && p.FiscalQuarter != nil) || (p.PeriodType == "quarterly" && p.FiscalQuarter == nil) {
		return errors.New("invalid fiscal quarter")
	}
	i, e := financialValues(income, p.ID, "income_statements")
	if e != nil {
		return e
	}
	b, e := financialValues(balance, p.ID, "balance_sheets")
	if e != nil {
		return e
	}
	c, e := financialValues(cashflow, p.ID, "cash_flow_statements")
	if e != nil {
		return e
	}
	assets, liabilities, equity := b["totalAssets"], b["totalLiabilities"], b["totalEquity"]
	if assets == nil || liabilities == nil || equity == nil || *assets < 0 || *liabilities < 0 || (*assets == 0 && math.Abs(*assets-*liabilities-*equity) > 1e-9) || (*assets > 0 && math.Abs(*assets-*liabilities-*equity) / *assets > .01) {
		return errors.New("balance equation requires review")
	}
	tx, e := s.DB.BeginTx(ctx, nil)
	if e != nil {
		return e
	}
	defer tx.Rollback()
	if _, e = tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "canonical-research:"+p.SecurityID); e != nil {
		return e
	}
	var reviewed bool
	e = tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM market.filing_history_reviews WHERE period_id=$1)`, p.ID).Scan(&reviewed)
	if e != nil {
		return e
	}
	if reviewed {
		return errors.New("reviewed period requires audited publication, not adapter overwrite")
	}
	var storedID string
	e = tx.QueryRowContext(ctx, `INSERT INTO market.financial_periods(id,security_id,period_type,fiscal_year,fiscal_quarter,period_end,reported_at,currency) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET reported_at=EXCLUDED.reported_at WHERE financial_periods.security_id=EXCLUDED.security_id AND financial_periods.currency=EXCLUDED.currency AND financial_periods.period_type=EXCLUDED.period_type AND financial_periods.fiscal_year=EXCLUDED.fiscal_year AND financial_periods.fiscal_quarter IS NOT DISTINCT FROM EXCLUDED.fiscal_quarter AND financial_periods.period_end=EXCLUDED.period_end RETURNING id`, p.ID, p.SecurityID, p.PeriodType, p.FiscalYear, p.FiscalQuarter, p.PeriodEnd, p.ReportedAt, p.Currency).Scan(&storedID)
	if e != nil {
		return e
	}
	if storedID != p.ID {
		return errors.New("financial period identity conflict")
	}
	for _, component := range []struct {
		table  string
		values map[string]*float64
	}{{"income_statements", i}, {"balance_sheets", b}, {"cash_flow_statements", c}} {
		if e = writeFinancialComponent(ctx, tx, p.ID, component.table, component.values); e != nil {
			return e
		}
	}
	return tx.Commit()
}
