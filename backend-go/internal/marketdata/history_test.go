package marketdata

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"github.com/DATA-DOG/go-sqlmock"
	"strings"
	"testing"
	"time"
)

type fixtureConverter struct{}

func (fixtureConverter) ConvertValue(value any) (driver.Value, error) {
	if values, ok := value.([]string); ok {
		return strings.Join(values, ","), nil
	}
	return driver.DefaultParameterConverter.ConvertValue(value)
}
func mockStore(t *testing.T) (*Store, sqlmock.Sqlmock) {
	t.Helper()
	db, m, e := sqlmock.New(sqlmock.ValueConverterOption(fixtureConverter{}))
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() {
		if e := m.ExpectationsWereMet(); e != nil {
			t.Error(e)
		}
		db.Close()
	})
	return &Store{DB: db}, m
}
func TestCandleReadRequiresSourceByDefaultAndPreservesDateAndNulls(t *testing.T) {
	s, m := mockStore(t)
	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := from.AddDate(0, 1, 0)
	m.ExpectQuery(`SELECT row_to_json.*source_url IS NOT NULL.*ORDER BY bar_time ASC`).WithArgs("NSE:COOP", "1d", from, to, false).WillReturnRows(sqlmock.NewRows([]string{"result"}).AddRow([]byte(`{"securityId":"NSE:COOP","timestamp":"2026-01-01T12:00:00.000Z","close":20,"sourceUrl":null}`)))
	m.ExpectQuery(`WITH latest AS.*redistribution_allowed=true.*r2://continua-financial-documents/.*unknown.*adjustment`).WithArgs("NSE:COOP", from, to).WillReturnRows(sqlmock.NewRows([]string{"result"}).AddRow([]byte(`{"timestamp":"2026-01-01T00:00:00.000Z","close":19}`)))
	rows, e := s.Candles(context.Background(), "NSE:COOP", "1d", from, to)
	if e != nil || len(rows) != 1 || !strings.Contains(string(rows[0]), `"sourceUrl":null`) {
		t.Fatal(rows, e)
	}
}
func TestFinancialReadsUseSharedCanonicalModelAndPreserveNulls(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`SELECT payload FROM market.canonical_financial_history`).WithArgs("NSE:COOP", "annual", 1, false).WillReturnRows(sqlmock.NewRows([]string{"payload"}).AddRow([]byte(`{"fiscalYear":2025,"eps":null}`)))
	raw, e := s.LatestFinancials(context.Background(), "NSE:COOP", "annual")
	if e != nil || !strings.Contains(string(raw), `"eps":null`) {
		t.Fatal(string(raw), e)
	}
	m.ExpectQuery(`SELECT payload FROM market.canonical_financial_history`).WithArgs("NSE:COOP", "annual", 5, false).WillReturnRows(sqlmock.NewRows([]string{"payload"}).AddRow([]byte(`{"fiscalYear":2024}`)).AddRow([]byte(`{"fiscalYear":2025}`)))
	rows, e := s.FinancialHistory(context.Background(), "NSE:COOP", "annual", 5)
	if e != nil || string(rows[0]) != `{"fiscalYear":2024}` {
		t.Fatal(rows, e)
	}
	for _, limit := range []int{0, 101} {
		if _, e = s.FinancialHistory(context.Background(), "NSE:COOP", "annual", limit); e == nil {
			t.Fatal("invalid limit accepted")
		}
	}
}
func TestSparklinesExcludeUnknownStocksRatherThanFabricateLines(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`SELECT symbol,close.*source_url IS NOT NULL.*ORDER BY symbol,bar_time ASC`).WithArgs("NSE", sqlmock.AnyArg(), 20, false).WillReturnRows(sqlmock.NewRows([]string{"symbol", "close"}).AddRow("COOP", 20.0).AddRow("COOP", 21.0))
	lines, e := s.Sparklines(context.Background(), "NSE", []string{"COOP", "UNKNOWN"}, 20)
	if e != nil || len(lines) != 1 || len(lines["COOP"]) != 2 {
		t.Fatal(lines, e)
	}
}
func TestIndicesOnlyExposePublisherEODForNSE(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`SELECT row_to_json.*source='eod'.*ORDER BY code`).WithArgs("NSE").WillReturnRows(sqlmock.NewRows([]string{"result"}))
	rows, e := s.Indices(context.Background(), "NSE")
	if e != nil || rows == nil {
		t.Fatal(rows, e)
	}
}
func TestPublisherTableReadsRequirePermissionDigestAndLatestCategory(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`SELECT row_to_json.*DISTINCT ON.*s.redistribution_allowed=true.*a.sha256.*a.metadata->>'tab'='Financials'.*a.content_type LIKE.*ORDER BY.*e.extracted_at DESC,e.id DESC`).WithArgs("COOP").WillReturnRows(sqlmock.NewRows([]string{"result"}))
	rows, e := s.PublisherFinancialRows(context.Background(), "COOP")
	if e != nil || string(mustJSON(rows)) != "[]" {
		t.Fatal(rows, e)
	}
}
func TestCollectedResearchReadRechecksRightsAndPrivateEvidence(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`SELECT payload.*DISTINCT ON.*s.enabled AND s.redistribution_allowed=true.*permissionReference.*r2://continua-financial-documents/.*ORDER BY.*LIMIT \$2 OFFSET \$3`).WithArgs("NSE:COOP", 20, 0).WillReturnRows(sqlmock.NewRows([]string{"payload"}).AddRow(`{"destination":"history"}`))
	rows, err := s.CollectedResearch(context.Background(), "COOP", 20, 0)
	if err != nil || len(rows) != 1 {
		t.Fatal(rows, err)
	}
}
func mustJSON(value any) []byte { raw, _ := json.Marshal(value); return raw }
