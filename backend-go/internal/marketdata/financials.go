package marketdata

import (
	"context"
	"encoding/json"
)

const financialJoins = ` FROM market.financial_periods p LEFT JOIN market.income_statements i ON i.period_id=p.id LEFT JOIN market.balance_sheets b ON b.period_id=p.id LEFT JOIN market.cash_flow_statements c ON c.period_id=p.id `
const financialEligibility = `WHERE p.security_id=$1 AND p.period_type=$2 AND p.period_end<=CURRENT_DATE AND p.reported_at<=CURRENT_DATE AND ($3 OR EXISTS(SELECT 1 FROM market.filing_history_reviews reviewed WHERE reviewed.period_id=p.id)) AND (i.period_id IS NOT NULL OR b.period_id IS NOT NULL OR c.period_id IS NOT NULL) `
const financialColumns = `p.fiscal_year AS "fiscalYear",p.fiscal_quarter AS "fiscalQuarter",p.period_end::text AS "periodEnd",p.reported_at::text AS "reportedAt",p.currency,i.revenue,i.net_income AS "netIncome",i.eps,i.gross_profit AS "grossProfit",i.operating_income AS "operatingIncome",i.ebitda,b.total_assets AS "totalAssets",b.total_liabilities AS "totalLiabilities",b.total_equity AS "totalEquity",b.cash,b.total_debt AS "totalDebt",b.current_assets AS "currentAssets",b.current_liabilities AS "currentLiabilities",b.shares_outstanding AS "sharesOutstanding",c.operating_cash_flow AS "operatingCashFlow",c.free_cash_flow AS "freeCashFlow"`

func (s *Store) LatestFinancials(ctx context.Context, id, periodType string) (json.RawMessage, error) {
	rows, err := s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT p.id AS "periodId",p.security_id AS "securityId",p.period_type AS "periodType",`+financialColumns+financialJoins+financialEligibility+`ORDER BY p.fiscal_year DESC,p.fiscal_quarter DESC NULLS FIRST LIMIT 1) result`, id, periodType, s.AllowUnreviewed)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return rows[0], nil
}
func (s *Store) FinancialHistory(ctx context.Context, id, periodType string, limit int) ([]json.RawMessage, error) {
	rows, err := s.JSONRows(ctx, `SELECT row_to_json(result) FROM (SELECT `+financialColumns+`,i.cost_of_revenue AS "costOfRevenue",i.operating_expenses AS "operatingExpenses",c.investing_cash_flow AS "investingCashFlow",c.financing_cash_flow AS "financingCashFlow",c.capex,(SELECT array_agg(DISTINCT r.source_url) FROM market.filing_history_reviews r WHERE r.period_id=p.id) AS "sourceUrls"`+financialJoins+financialEligibility+`ORDER BY p.fiscal_year DESC,p.fiscal_quarter DESC NULLS FIRST LIMIT $4) result`, id, periodType, s.AllowUnreviewed, limit)
	if err != nil {
		return nil, err
	}
	for i, j := 0, len(rows)-1; i < j; i, j = i+1, j-1 {
		rows[i], rows[j] = rows[j], rows[i]
	}
	return rows, nil
}
