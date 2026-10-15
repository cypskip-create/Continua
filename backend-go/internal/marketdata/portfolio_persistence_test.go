package marketdata

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

func TestPortfolioPersistenceReadsOnlyVerifiedOwnerAndRollsBackOnFailure(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectBegin()
	m.ExpectQuery(`SELECT row_to_json.*engine_portfolio_snapshots.*WHERE user_id=\$1 AND exchange=\$2`).WithArgs("owner-a", "NSE").WillReturnRows(sqlmock.NewRows([]string{"row"}).AddRow([]byte(`{"date":"2026-10-14","value":400,"flow":0}`)))
	m.ExpectQuery(`SELECT row_to_json.*public.engine_cash_flows.*WHERE user_id=\$1 AND exchange=\$2`).WithArgs("owner-a", "NSE").WillReturnError(errors.New("fixture failure"))
	m.ExpectRollback()
	if _, e := s.PortfolioPersistence(context.Background(), "owner-a", "NSE"); e == nil {
		t.Fatal("inconsistent partial persistence exposed")
	}
}
func TestPortfolioSnapshotUsesOwnerAndAvoidsUnchangedWrite(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectExec(`INSERT INTO market.engine_portfolio_snapshots.*IS DISTINCT FROM`).WithArgs("owner-a", "NSE", "KES", "2026-10-14", 400.0, "[]").WillReturnResult(sqlmock.NewResult(0, 0))
	if e := s.SavePortfolioSnapshot(context.Background(), "owner-a", "NSE", "KES", "2026-10-14", 400, []json.RawMessage{}); e != nil {
		t.Fatal(e)
	}
}
