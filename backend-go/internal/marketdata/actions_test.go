package marketdata

import (
	"context"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"strings"
	"testing"
)

func TestReviewedEarningsNullIsNotReplacedWithStaleCalendarValue(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`SELECT row_to_json.*CASE WHEN reviewed.id IS NOT NULL THEN reviewed.eps ELSE ee.eps_actual.*filing_history_reviews.*LIMIT \$2`).WithArgs("NSE:KCB", 12).WillReturnRows(sqlmock.NewRows([]string{"result"}).AddRow([]byte(`{"fiscalYear":2025,"epsActual":null}`)).AddRow([]byte(`{"fiscalYear":2024,"epsActual":5}`)))
	rows, err := s.Earnings(context.Background(), "NSE:KCB", 12)
	if err != nil || len(rows) != 2 || !strings.Contains(string(rows[1]), `"epsActual":null`) {
		t.Fatal(rows, err)
	}
}
func TestDividendAndOwnershipReadersKeepObservedDateBasis(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectQuery(`SELECT row_to_json.*ca.ex_date>=CURRENT_DATE.*ORDER BY ca.ex_date ASC`).WithArgs("NSE", 20).WillReturnRows(sqlmock.NewRows([]string{"result"}))
	if _, err := s.UpcomingDividends(context.Background(), "NSE", 20); err != nil {
		t.Fatal(err)
	}
	m.ExpectQuery(`SELECT row_to_json.*to_char\(as_of AT TIME ZONE 'UTC'.*ORDER BY percent_held DESC`).WithArgs("NSE:KCB").WillReturnRows(sqlmock.NewRows([]string{"result"}).AddRow([]byte(`{"holderName":"Fixture","asOf":"2026-09-30T00:00:00.000Z"}`)))
	if _, err := s.Ownership(context.Background(), "NSE:KCB"); err != nil {
		t.Fatal(err)
	}
}
func TestOwnershipBatchFailureCannotPublishPartialSnapshot(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectBegin()
	m.ExpectExec(`INSERT INTO market.ownership`).WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectExec(`INSERT INTO market.ownership`).WillReturnError(errors.New("fixture invalid record"))
	m.ExpectRollback()
	err := s.UpsertOwnership(context.Background(), []OwnershipRecord{{SecurityID: "NSE:KCB", HolderName: "A", HolderType: "institution", AsOf: "2026-10-12", SharesHeld: 100, PercentHeld: 1}, {SecurityID: "NSE:KCB", HolderName: "B", HolderType: "institution", AsOf: "2026-10-12", SharesHeld: 200, PercentHeld: 2}})
	if err == nil {
		t.Fatal("partial holder snapshot committed")
	}
}
