package marketdata

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
	"time"
)

func financialBundleFixture() (FinancialPeriodInput, json.RawMessage, json.RawMessage, json.RawMessage, time.Time) {
	return FinancialPeriodInput{ID: "NSE:period:KCB:2025", SecurityID: "NSE:KCB", PeriodType: "annual", FiscalYear: 2025, PeriodEnd: "2025-12-31", ReportedAt: "2026-03-01", Currency: "KES"}, json.RawMessage(`{"periodId":"NSE:period:KCB:2025","revenue":50,"netIncome":10,"eps":null}`), json.RawMessage(`{"periodId":"NSE:period:KCB:2025","totalAssets":100,"totalLiabilities":70,"totalEquity":30}`), json.RawMessage(`{"periodId":"NSE:period:KCB:2025","operatingCashFlow":null}`), time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC)
}
func TestAdapterFinancialsCannotReplaceReviewedFilings(t *testing.T) {
	s, m := mockStore(t)
	p, i, b, c, now := financialBundleFixture()
	m.ExpectBegin()
	m.ExpectExec(`SELECT pg_advisory_xact_lock`).WithArgs("canonical-research:NSE:KCB").WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectQuery(`SELECT EXISTS.*filing_history_reviews`).WithArgs(p.ID).WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	m.ExpectRollback()
	if s.UpsertPeriodBundle(context.Background(), p, i, b, c, now) == nil {
		t.Fatal("reviewed filing overwritten")
	}
}
func TestFinancialComponentFailureRollsBackWholePeriod(t *testing.T) {
	s, m := mockStore(t)
	p, i, b, c, now := financialBundleFixture()
	m.ExpectBegin()
	m.ExpectExec(`SELECT pg_advisory_xact_lock`).WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectQuery(`SELECT EXISTS`).WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	m.ExpectQuery(`INSERT INTO market.financial_periods.*RETURNING id`).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(p.ID))
	m.ExpectExec(`INSERT INTO market.income_statements`).WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectExec(`INSERT INTO market.balance_sheets`).WillReturnError(errors.New("fixture failure"))
	m.ExpectRollback()
	if s.UpsertPeriodBundle(context.Background(), p, i, b, c, now) == nil {
		t.Fatal("partial financial period committed")
	}
}
func TestFinancialIdentityAndUnbalancedDataFailBeforeSQL(t *testing.T) {
	s, _ := mockStore(t)
	p, i, b, c, now := financialBundleFixture()
	p.ReportedAt = "2027-03-01"
	if s.UpsertPeriodBundle(context.Background(), p, i, b, c, now) == nil {
		t.Fatal("future filing accepted")
	}
	p.ReportedAt = "2026-03-01"
	b = json.RawMessage(`{"periodId":"NSE:period:KCB:2025","totalAssets":100,"totalLiabilities":70,"totalEquity":60}`)
	if s.UpsertPeriodBundle(context.Background(), p, i, b, c, now) == nil {
		t.Fatal("unbalanced financials accepted")
	}
}
