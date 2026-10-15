package marketdata

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func verifyFinancialPostgresFixture(t *testing.T, store *Store, ctx context.Context) {
	t.Helper()
	for _, relative := range []string{
		"scraper/migrations/20260827090000 scraping engine foundation schema.sql",
		"scraper/migrations/20260829090000 dead letters unique constraint.sql",
		"scraper/migrations/20261015190000 scheduled collector budgets.sql",
		"backend/migration/20260901090000 financial statement candidates bridge.sql",
		"supabase/migrations/20261010140000_filing_history_reviews.sql",
		"supabase/migrations/20261011123000_partial_reported_statements.sql",
		"supabase/migrations/20261012011000_financial_version_audit.sql",
	} {
		body, err := os.ReadFile(filepath.Join("..", "..", "..", filepath.FromSlash(relative)))
		if err != nil {
			t.Fatal(err)
		}
		if _, err = store.DB.ExecContext(ctx, string(body)); err != nil {
			t.Fatal("fixture schema extension failed", relative, err)
		}
	}
	p, income, balance, cashflow, now := financialBundleFixture()
	cashflow, _ = json.Marshal(map[string]any{"periodId": p.ID, "operatingCashFlow": nil, "freeCashFlow": 25})
	if err := store.UpsertPeriodBundle(ctx, p, income, balance, cashflow, now); err != nil {
		t.Fatal("actual financial bundle SQL failed", err)
	}
	var auditBefore int
	if err := store.DB.QueryRowContext(ctx, `SELECT count(*) FROM market.financial_version_audit`).Scan(&auditBefore); err != nil || auditBefore != 4 {
		t.Fatal("financial insert audit incomplete", err)
	}
	if err := store.UpsertPeriodBundle(ctx, p, income, balance, cashflow, now); err != nil {
		t.Fatal(err)
	}
	var auditAfter int
	if err := store.DB.QueryRowContext(ctx, `SELECT count(*) FROM market.financial_version_audit`).Scan(&auditAfter); err != nil || auditAfter != auditBefore {
		t.Fatal("unchanged financials created false revisions", err)
	}
	raw, err := store.LatestFinancials(ctx, p.SecurityID, "annual")
	if err != nil || raw != nil {
		t.Fatal("unreviewed period escaped production reads", err)
	}
	var candidate int64
	if err = store.DB.QueryRowContext(ctx, `INSERT INTO market.financial_statement_candidates(security_id,source,exchange,document_url,detected_table) VALUES($1,'fixture','NSE','https://fixture.invalid/report.pdf','{}') RETURNING id`, p.SecurityID).Scan(&candidate); err != nil {
		t.Fatal(err)
	}
	if _, err = store.DB.ExecContext(ctx, `INSERT INTO market.filing_history_reviews(candidate_id,period_id,column_index,statement_type,source_url,source_page,review_note,reviewed_values) VALUES($1,$2,0,'balance','https://fixture.invalid/report.pdf',1,'Synthetic fixture balance review',$3::jsonb)`, candidate, p.ID, string(balance)); err != nil {
		t.Fatal(err)
	}
	raw, err = store.LatestFinancials(ctx, p.SecurityID, "annual")
	if err != nil || raw == nil {
		t.Fatal("reviewed balance unavailable", err)
	}
	var fields map[string]any
	if json.Unmarshal(raw, &fields) != nil {
		t.Fatal("invalid financial wire response")
	}
	if fields["totalAssets"] != float64(100) || fields["revenue"] != nil || fields["netIncome"] != nil || fields["freeCashFlow"] != nil {
		t.Fatal("review of balance sheet exposed another unreviewed statement")
	}
	if _, err = store.DB.ExecContext(ctx, `INSERT INTO market.earnings_events(id,security_id,fiscal_year,reported_date) VALUES('fixture-earnings',$1,$2,$3::date)`, p.SecurityID, p.FiscalYear, p.ReportedAt); err != nil {
		t.Fatal(err)
	}
	earnings, err := store.Earnings(ctx, p.SecurityID, 12)
	if err != nil || len(earnings) != 1 {
		t.Fatal("earnings fixture read failed", err)
	}
	var event map[string]any
	if json.Unmarshal(earnings[0], &event) != nil || event["revenueActual"] != nil {
		t.Fatal("balance review exposed unreviewed earnings")
	}
	if err = store.UpsertPeriodBundle(ctx, p, income, balance, cashflow, now); err == nil {
		t.Fatal("adapter replaced reviewed period")
	}
	for _, component := range []struct {
		kind string
		body json.RawMessage
	}{{"income", income}, {"cashflow", cashflow}} {
		if _, err = store.DB.ExecContext(ctx, `INSERT INTO market.filing_history_reviews(candidate_id,period_id,column_index,statement_type,source_url,source_page,review_note,reviewed_values) VALUES($1,$2,0,$3,'https://fixture.invalid/report.pdf',1,'Synthetic fixture component review',$4::jsonb)`, candidate, p.ID, component.kind, string(component.body)); err != nil {
			t.Fatal(err)
		}
		raw, err = store.LatestFinancials(ctx, p.SecurityID, "annual")
		if err != nil || json.Unmarshal(raw, &fields) != nil {
			t.Fatal("component review read failed", err)
		}
		if fields["revenue"] != float64(50) || fields["netIncome"] != float64(10) || fields["eps"] != nil {
			t.Fatal("income component or missing EPS was altered")
		}
		if component.kind == "income" && fields["freeCashFlow"] != nil {
			t.Fatal("income review exposed unreviewed cash flow")
		}
		if component.kind == "cashflow" && (fields["freeCashFlow"] != float64(25) || fields["operatingCashFlow"] != nil) {
			t.Fatal("cashflow review or missing CFO was altered")
		}
	}
	// A later component error must roll back the period, income and audit rows.
	if _, err = store.DB.ExecContext(ctx, `ALTER TABLE market.balance_sheets ADD CONSTRAINT fixture_balance_failure CHECK(total_assets<200)`); err != nil {
		t.Fatal(err)
	}
	failed := p
	failed.ID = p.ID + ":failed"
	failedIncome := json.RawMessage(strings.ReplaceAll(string(income), p.ID, failed.ID))
	failedCash := json.RawMessage(strings.ReplaceAll(string(cashflow), p.ID, failed.ID))
	failedBalance, _ := json.Marshal(map[string]any{"periodId": failed.ID, "totalAssets": 300, "totalLiabilities": 270, "totalEquity": 30})
	if err = store.UpsertPeriodBundle(ctx, failed, failedIncome, failedBalance, failedCash, now); err == nil {
		t.Fatal("expected database component failure")
	}
	var absent bool
	if err = store.DB.QueryRowContext(ctx, `SELECT NOT EXISTS(SELECT 1 FROM market.financial_periods WHERE id=$1) AND NOT EXISTS(SELECT 1 FROM market.financial_version_audit WHERE period_id=$1)`, failed.ID).Scan(&absent); err != nil || !absent {
		t.Fatal("partial financial bundle or audit committed", err)
	}
}
