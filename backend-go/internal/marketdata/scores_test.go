package marketdata

import (
	"context"
	"encoding/json"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/jackc/pgx/v5/pgconn"
	"testing"
)

func TestSectorPeersUseReviewedSameYearFinancialsOnEachQuoteDate(t *testing.T) {
	s, m := mockStore(t)
	year := 2025
	m.ExpectQuery(`SELECT AVG.*p.fiscal_year=\$5.*p.reported_at<=q.event_timestamp::date.*filing_history_reviews.*q.event_timestamp>=now\(\)-interval '7 days'`).WithArgs("NSE", "banking", "NSE:KCB", false, year).WillReturnRows(sqlmock.NewRows([]string{"pe", "yield", "count"}).AddRow(7.73, nil, 3))
	average, err := s.SectorAverage(context.Background(), "NSE", "banking", "NSE:KCB", &year)
	if err != nil || average.AvgDividendYield != nil || average.SampleSize != 3 {
		t.Fatal(average, err)
	}
}
func TestRatiosOnlyUsePSFallbackForThatExactMissingColumn(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectExec(`INSERT INTO market.computed_ratios \(security_id,as_of,pe,ps,pb`).WillReturnError(&pgconn.PgError{Code: "42703", Message: `column "ps" does not exist`})
	m.ExpectExec(`INSERT INTO market.computed_ratios \(security_id,as_of,pe,pb`).WillReturnResult(sqlmock.NewResult(0, 1))
	raw := json.RawMessage(`{"securityId":"NSE:KCB","asOf":"2026-10-12T12:00:00.000Z","pe":13.96,"eps":null}`)
	if err := s.UpsertRatios(context.Background(), raw); err != nil {
		t.Fatal(err)
	}
	m.ExpectExec(`INSERT INTO market.computed_ratios`).WillReturnError(&pgconn.PgError{Code: "42703", Message: `column "pe" does not exist`})
	if err := s.UpsertRatios(context.Background(), raw); err == nil {
		t.Fatal("unrelated missing column masked")
	}
}
func TestScoreStringAndBooleanAreNotAcceptedAsNumericEvidence(t *testing.T) {
	s, _ := mockStore(t)
	for _, raw := range []string{`{"securityId":"NSE:KCB","asOf":"2026-10-12","pe":"13.96"}`, `{"securityId":"NSE:KCB","asOf":"2026-10-12","pe":true}`} {
		if err := s.UpsertRatios(context.Background(), json.RawMessage(raw)); err == nil {
			t.Fatal("invalid numeric evidence persisted")
		}
	}
}

func TestChangedFilingBasisCannotPersistOldResearch(t *testing.T) {
	s, m := mockStore(t)
	ratios := json.RawMessage(`{"securityId":"NSE:KCB","asOf":"2026-10-12T12:00:00.000Z","pe":15}`)
	score := json.RawMessage(`{"securityId":"NSE:KCB","asOf":"2026-10-12T12:00:00.000Z","afriScore":50,"inputs":{"pe":15}}`)
	m.ExpectBegin()
	m.ExpectExec(`pg_advisory_xact_lock`).WithArgs("canonical-research:NSE:KCB").WillReturnResult(sqlmock.NewResult(0, 0))
	m.ExpectQuery(`SELECT event_timestamp=.*FOR SHARE`).WithArgs("NSE:KCB", "2026-10-12T12:00:00.000Z", 90.0).WillReturnRows(sqlmock.NewRows([]string{"matches"}).AddRow(true))
	m.ExpectQuery(`SELECT md5`).WillReturnRows(sqlmock.NewRows([]string{"version"}).AddRow("2"))
	m.ExpectRollback()
	stored, err := s.PersistResearch(context.Background(), ratios, score, "1", 90)
	if err != nil || stored {
		t.Fatal("old filing research persisted", stored, err)
	}
}
func TestDerivedRatioAndScoreCommitTogether(t *testing.T) {
	s, m := mockStore(t)
	ratios := json.RawMessage(`{"securityId":"NSE:KCB","asOf":"2026-10-12T12:00:00.000Z","pe":15}`)
	score := json.RawMessage(`{"securityId":"NSE:KCB","asOf":"2026-10-12T12:00:00.000Z","afriScore":50,"inputs":{"pe":15}}`)
	m.ExpectBegin()
	m.ExpectExec(`pg_advisory_xact_lock`).WillReturnResult(sqlmock.NewResult(0, 0))
	m.ExpectQuery(`SELECT event_timestamp=.*FOR SHARE`).WillReturnRows(sqlmock.NewRows([]string{"matches"}).AddRow(true))
	m.ExpectQuery(`SELECT md5`).WillReturnRows(sqlmock.NewRows([]string{"version"}).AddRow("1"))
	m.ExpectExec(`SAVEPOINT native_ratios`).WillReturnResult(sqlmock.NewResult(0, 0))
	m.ExpectExec(`INSERT INTO market.computed_ratios`).WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectExec(`INSERT INTO market.afri_scores`).WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectCommit()
	stored, err := s.PersistResearch(context.Background(), ratios, score, "1", 90)
	if err != nil || !stored {
		t.Fatal(stored, err)
	}
}
