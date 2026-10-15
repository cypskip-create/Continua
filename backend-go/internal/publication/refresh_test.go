package publication

import (
	"context"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

func TestRefreshLeaseCompletesOnlyClaimedVersion(t *testing.T) {
	s, m := fixture(t)
	s.DurableRefresh = true
	calls := 0
	s.RefreshResearch = func(context.Context, string, string) error { calls++; return nil }
	m.ExpectQuery(`WITH due AS`).WithArgs(sqlmock.AnyArg()).WillReturnRows(sqlmock.NewRows([]string{"security", "symbol", "version"}).AddRow("NSE:KCB", "KCB", 7))
	// Another filing changed the version during recomputation; zero deletions.
	m.ExpectExec(`DELETE FROM market.native_research_refresh`).WithArgs("NSE:KCB", sqlmock.AnyArg(), int64(7)).WillReturnResult(sqlmock.NewResult(0, 0))
	m.ExpectExec(`UPDATE market.native_research_refresh SET lease_token=NULL`).WithArgs("NSE:KCB", sqlmock.AnyArg()).WillReturnResult(sqlmock.NewResult(0, 1))
	n, err := s.DrainRefresh(context.Background(), 1)
	if err != nil || n != 0 || calls != 1 {
		t.Fatal(n, calls, err)
	}
}
func TestRefreshFailureRetainsDurableRetry(t *testing.T) {
	s, m := fixture(t)
	s.DurableRefresh = true
	s.RefreshResearch = func(context.Context, string, string) error { return errors.New("provider secret must not be stored") }
	m.ExpectQuery(`WITH due AS`).WillReturnRows(sqlmock.NewRows([]string{"security", "symbol", "version"}).AddRow("NSE:KCB", "KCB", 7))
	m.ExpectExec(`UPDATE market.native_research_refresh SET lease_token=NULL`).WithArgs("NSE:KCB", sqlmock.AnyArg(), int64(7)).WillReturnResult(sqlmock.NewResult(0, 1))
	n, err := s.DrainRefresh(context.Background(), 1)
	if err != nil || n != 0 {
		t.Fatal(n, err)
	}
}
func TestRefreshEnqueueFailurePreventsPublicationCommit(t *testing.T) {
	s, m := fixture(t)
	m.ExpectBegin()
	tx, err := s.DB.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	m.ExpectExec(`INSERT INTO market.native_research_refresh`).WithArgs("NSE:KCB", "KCB").WillReturnError(errors.New("fixture unavailable"))
	if enqueueRefresh(context.Background(), tx, "NSE:KCB", "KCB") == nil {
		t.Fatal("publication without durable refresh")
	}
	m.ExpectRollback()
	_ = tx.Rollback()
}
