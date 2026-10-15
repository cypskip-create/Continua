package engine

import (
	"context"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
	"time"
)

type workspaceCalculation struct{ assembly bool }

func (w workspaceCalculation) Calculate(_ context.Context, r Request) (json.RawMessage, error) {
	if !w.assembly {
		if r.Operation != "snapshot_plan" {
			panic("wrong operation")
		}
		return json.RawMessage(`{"complete":false,"selectedSymbols":[]}`), nil
	}
	if r.Operation != "portfolio_workspace" {
		panic("wrong assembly operation")
	}
	data := r.Args[0].(map[string]any)
	if data["persistenceAvailable"] != true {
		panic("healthy persistence hidden")
	}
	return json.RawMessage(`{"available":true,"positions":[],"performance":{"twr":null}}`), nil
}

type unusedWorkspaceBundles struct{}

func (unusedWorkspaceBundles) Bundle(context.Context, string, string) (json.RawMessage, error) {
	panic("empty portfolio must not request company bundles")
}
func TestEmptyOwnedWorkspaceDoesNotWriteSnapshotOrFetchCompanies(t *testing.T) {
	db, m, e := sqlmock.New()
	if e != nil {
		t.Fatal(e)
	}
	defer db.Close()
	m.ExpectQuery(`WITH holdings AS.*WHERE user_id=\$1`).WithArgs("owner-a", "NSE").WillReturnRows(sqlmock.NewRows([]string{"result"}))
	m.ExpectBegin()
	m.ExpectQuery(`SELECT row_to_json.*engine_portfolio_snapshots`).WithArgs("owner-a", "NSE").WillReturnRows(sqlmock.NewRows([]string{"result"}))
	m.ExpectQuery(`SELECT row_to_json.*ORDER BY session_date DESC LIMIT 100`).WithArgs("owner-a", "NSE").WillReturnRows(sqlmock.NewRows([]string{"result"}))
	m.ExpectQuery(`SELECT row_to_json.*GROUP BY session_date`).WithArgs("owner-a", "NSE").WillReturnRows(sqlmock.NewRows([]string{"result"}))
	m.ExpectCommit()
	service := NewPortfolioWorkspace(&marketdata.Store{DB: db}, workspaceCalculation{}, workspaceCalculation{assembly: true}, unusedWorkspaceBundles{})
	service.Now = func() time.Time { return time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC) }
	raw, e := service.Research(context.Background(), "owner-a", "NSE")
	if e != nil || !json.Valid(raw) {
		t.Fatal(e, string(raw))
	}
	if e = m.ExpectationsWereMet(); e != nil {
		t.Fatal(e)
	}
}
