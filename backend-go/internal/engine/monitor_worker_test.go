package engine

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

type monitorCalculation struct{ fail bool }

func (c monitorCalculation) Calculate(context.Context, Request) (json.RawMessage, error) {
	if c.fail {
		return nil, errors.New("fixture outage")
	}
	return json.RawMessage(`{"state":{"notify":true,"triggered":true},"eventKey":"2026-10-14:price_above","message":"Literal threshold crossing"}`), nil
}
func TestMonitorDeliveryAndStateAreOneAtomicTransaction(t *testing.T) {
	db, m, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	defer func() {
		if err := m.ExpectationsWereMet(); err != nil {
			t.Error(err)
		}
	}()
	s := MonitorWorker{DB: db, Worker: monitorCalculation{}}
	id := monitorIdentity{ID: "r1", UserID: "u1", Symbol: "KCB", Exchange: "NSE"}
	m.ExpectBegin()
	m.ExpectQuery(`SELECT json_build_object.*effective_subscription_plan.*FOR UPDATE OF r`).WithArgs("r1", "u1").WillReturnRows(sqlmock.NewRows([]string{"rule", "notify"}).AddRow([]byte(`{"kind":"price_above","threshold":10}`), true))
	m.ExpectQuery(`INSERT INTO market.engine_monitor_deliveries.*ON CONFLICT DO NOTHING`).WithArgs("r1", "2026-10-14:price_above").WillReturnRows(sqlmock.NewRows([]string{"rule_id"}).AddRow("r1"))
	m.ExpectQuery(`INSERT INTO public.notifications`).WithArgs("u1", "KCB research update", "Literal threshold crossing", "/engine?symbol=KCB").WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("n1"))
	m.ExpectExec(`UPDATE market.engine_monitor_deliveries`).WithArgs("r1", "2026-10-14:price_above", "n1").WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectExec(`UPDATE market.engine_monitor_rules SET last_state`).WithArgs("r1", `{"notify":true,"triggered":true}`).WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectCommit()
	if err := s.evaluate(context.Background(), id, json.RawMessage(`{}`)); err != nil {
		t.Fatal(err)
	}
}
func TestMonitorDuplicateReceiptNeverCreatesSecondNotification(t *testing.T) {
	db, m, _ := sqlmock.New()
	defer db.Close()
	defer func() {
		if err := m.ExpectationsWereMet(); err != nil {
			t.Error(err)
		}
	}()
	s := MonitorWorker{DB: db, Worker: monitorCalculation{}}
	id := monitorIdentity{ID: "r1", UserID: "u1", Symbol: "KCB"}
	m.ExpectBegin()
	m.ExpectQuery(`SELECT json_build_object`).WillReturnRows(sqlmock.NewRows([]string{"rule", "notify"}).AddRow([]byte(`{}`), true))
	m.ExpectQuery(`INSERT INTO market.engine_monitor_deliveries`).WillReturnRows(sqlmock.NewRows([]string{"rule_id"}))
	m.ExpectExec(`UPDATE market.engine_monitor_rules SET last_state`).WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectCommit()
	if err := s.evaluate(context.Background(), id, json.RawMessage(`{}`)); err != nil {
		t.Fatal(err)
	}
}
func TestMonitorCalculationOutageRollsBackAndCancelledMembershipDoesNotDeliver(t *testing.T) {
	db, m, _ := sqlmock.New()
	defer db.Close()
	defer func() {
		if err := m.ExpectationsWereMet(); err != nil {
			t.Error(err)
		}
	}()
	s := MonitorWorker{DB: db, Worker: monitorCalculation{fail: true}}
	id := monitorIdentity{ID: "r1", UserID: "u1"}
	m.ExpectBegin()
	m.ExpectQuery(`SELECT json_build_object`).WillReturnRows(sqlmock.NewRows([]string{"rule", "notify"}).AddRow([]byte(`{}`), true))
	m.ExpectRollback()
	if err := s.evaluate(context.Background(), id, json.RawMessage(`{}`)); err == nil {
		t.Fatal("outage ignored")
	}
	m.ExpectBegin()
	m.ExpectQuery(`SELECT json_build_object`).WillReturnRows(sqlmock.NewRows([]string{"rule", "notify"}))
	m.ExpectRollback()
	if err := s.evaluate(context.Background(), id, json.RawMessage(`{}`)); err != nil {
		t.Fatal(err)
	}
}
