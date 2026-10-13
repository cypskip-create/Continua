package marketdata

import (
	"context"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

func TestMonitorCapacityLockedBeforeWrite(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectBegin()
	m.ExpectExec(`pg_advisory_xact_lock`).WithArgs("engine-monitor-rules:owner").WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectQuery(`SELECT count`).WithArgs("owner", "NSE", "KCB", "price_above").WillReturnRows(sqlmock.NewRows([]string{"count", "exists"}).AddRow(50, false))
	m.ExpectRollback()
	_, err := s.SaveMonitoringRule(context.Background(), "owner", MonitorRule{Exchange: "NSE", Symbol: "KCB", Kind: "price_above", Enabled: true})
	if !errors.Is(err, ErrMonitorCapacity) {
		t.Fatal(err)
	}
}
func TestMonitorUpdateAtCapacityResetsStateAndCommits(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectBegin()
	m.ExpectExec(`pg_advisory_xact_lock`).WithArgs("engine-monitor-rules:owner").WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectQuery(`SELECT count`).WithArgs("owner", "NSE", "KCB", "price_above").WillReturnRows(sqlmock.NewRows([]string{"count", "exists"}).AddRow(50, true))
	threshold := 100.0
	m.ExpectQuery(`WITH saved AS.*last_state=NULL`).WithArgs("owner", "NSE", "KCB", "price_above", threshold, true).WillReturnRows(sqlmock.NewRows([]string{"result"}).AddRow([]byte(`{"symbol":"KCB","threshold":100,"enabled":true}`)))
	m.ExpectCommit()
	raw, err := s.SaveMonitoringRule(context.Background(), "owner", MonitorRule{Exchange: "NSE", Symbol: "KCB", Kind: "price_above", Threshold: &threshold, Enabled: true})
	if err != nil || len(raw) == 0 {
		t.Fatal(string(raw), err)
	}
}
func TestWorkspaceDeleteAndInsertAlwaysUseOwner(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectExec(`DELETE FROM market.engine_monitor_rules WHERE id=\$1 AND user_id=\$2`).WithArgs("target", "owner").WillReturnResult(sqlmock.NewResult(0, 0))
	if err := s.DeleteMonitoringRule(context.Background(), "owner", "target"); err != nil {
		t.Fatal(err)
	}
	m.ExpectExec(`DELETE FROM public.engine_cash_flows WHERE id=\$1 AND user_id=\$2`).WithArgs("target", "owner").WillReturnResult(sqlmock.NewResult(0, 0))
	if err := s.DeleteCashFlow(context.Background(), "owner", "target"); err != nil {
		t.Fatal(err)
	}
	m.ExpectQuery(`WITH saved AS.*INSERT INTO public.engine_cash_flows`).WithArgs("owner", "NSE", "2026-01-01", 25.0, "note").WillReturnRows(sqlmock.NewRows([]string{"result"}).AddRow([]byte(`{"id":"flow-id"}`)))
	if _, err := s.AddCashFlow(context.Background(), "owner", "NSE", "2026-01-01", 25, "note"); err != nil {
		t.Fatal(err)
	}
}
