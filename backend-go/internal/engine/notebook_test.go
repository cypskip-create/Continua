package engine

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
	"time"
)

type forecastCalculation struct{}

func (forecastCalculation) Calculate(_ context.Context, r Request) (json.RawMessage, error) {
	action := r.Args[0].(string)
	if action == "create" {
		return json.RawMessage(`{"valid":true,"data":{"symbol":"KCB","deadline":"2027-01-01T00:00:00Z","probability":0.6}}`), nil
	}
	return json.RawMessage(`{"valid":true,"data":{"probability":0.5,"rationale":"Observed evidence.","outcome":"yes","sourceUrl":"https://fixture.example/a","note":"Observed filing outcome."}}`), nil
}
func notebookFixture(t *testing.T) (*Notebook, sqlmock.Sqlmock) {
	t.Helper()
	db, m, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := m.ExpectationsWereMet(); err != nil {
			t.Error(err)
		}
		db.Close()
	})
	at := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	return &Notebook{DB: db, Worker: forecastCalculation{}, Now: func() time.Time { return at }}, m
}
func TestForecastCannotReadOrReviseAnotherOwner(t *testing.T) {
	s, m := notebookFixture(t)
	m.ExpectBegin()
	m.ExpectQuery(`SELECT status,deadline,revisions.*user_id=\$2 FOR UPDATE`).WithArgs("question", "owner-a").WillReturnRows(sqlmock.NewRows([]string{"status", "deadline", "revisions"}))
	m.ExpectRollback()
	_, err := s.Mutate(context.Background(), "owner-a", "question", "revise", json.RawMessage(`{}`))
	var problem *NotebookError
	if !errors.As(err, &problem) || problem.Status != 404 {
		t.Fatal(err)
	}
}
func TestDeadlineAndResolvedStateAreCheckedUnderLock(t *testing.T) {
	for _, status := range []string{"open", "resolved"} {
		s, m := notebookFixture(t)
		m.ExpectBegin()
		m.ExpectQuery(`SELECT status,deadline,revisions`).WillReturnRows(sqlmock.NewRows([]string{"status", "deadline", "revisions"}).AddRow(status, time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC), []byte(`[]`)))
		m.ExpectRollback()
		_, err := s.Mutate(context.Background(), "owner", "question", "revise", json.RawMessage(`{}`))
		var p *NotebookError
		if !errors.As(err, &p) || p.Status != 409 {
			t.Fatal(err)
		}
	}
}
func TestForecastAccountLimitIsSerialized(t *testing.T) {
	s, m := notebookFixture(t)
	m.ExpectBegin()
	m.ExpectExec(`SELECT pg_advisory_xact_lock`).WithArgs("forecast-notebook:owner").WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectQuery(`SELECT count.*user_id=\$1`).WithArgs("owner").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(100))
	m.ExpectRollback()
	_, err := s.Mutate(context.Background(), "owner", "", "create", json.RawMessage(`{}`))
	var p *NotebookError
	if !errors.As(err, &p) || p.Status != 400 {
		t.Fatal(err)
	}
}
func TestForecastResolutionHasOwnerScopedAtomicReceipt(t *testing.T) {
	s, m := notebookFixture(t)
	m.ExpectBegin()
	m.ExpectQuery(`SELECT status,deadline,revisions`).WithArgs("question", "owner").WillReturnRows(sqlmock.NewRows([]string{"status", "deadline", "revisions"}).AddRow("open", time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC), []byte(`[]`)))
	m.ExpectQuery(`WITH saved AS \(UPDATE.*WHERE id=\$5 AND user_id=\$6 RETURNING`).WithArgs("resolved", true, "https://fixture.example/a", "Observed filing outcome.", "question", "owner").WillReturnRows(sqlmock.NewRows([]string{"json"}).AddRow([]byte(`{"status":"resolved","outcome":true}`)))
	m.ExpectCommit()
	raw, err := s.Mutate(context.Background(), "owner", "question", "resolve", json.RawMessage(`{}`))
	if err != nil || string(raw) != `{"status":"resolved","outcome":true}` {
		t.Fatal(string(raw), err)
	}
}
