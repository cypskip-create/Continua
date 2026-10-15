package engine

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"strings"
	"testing"
)

type observationCalculator struct {
	previous    json.RawMessage
	failChanges bool
}

func (c *observationCalculator) Calculate(_ context.Context, r Request) (json.RawMessage, error) {
	if r.Operation == "evidence_fingerprint" {
		return json.RawMessage(`"` + strings.Repeat("a", 64) + `"`), nil
	}
	if c.failChanges {
		return nil, errors.New("fixture calculation unavailable")
	}
	if r.Args[0] != nil {
		c.previous = r.Args[0].(json.RawMessage)
	}
	return json.RawMessage(`{"baseline":false,"changes":[]}`), nil
}
func observationFixture(t *testing.T) (*ObservationRepository, sqlmock.Sqlmock, *observationCalculator) {
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
	calc := &observationCalculator{}
	return &ObservationRepository{DB: db, Worker: calc}, m, calc
}
func observationPrefix(m sqlmock.Sqlmock) {
	m.ExpectBegin()
	m.ExpectExec(`pg_advisory_xact_lock`).WithArgs("engine-state:NSE:KCB").WillReturnResult(sqlmock.NewResult(0, 0))
}

func TestUnchangedJSONBEvidenceUsesPersistedHashAndPreviousComparison(t *testing.T) {
	repo, m, calc := observationFixture(t)
	observationPrefix(m)
	m.ExpectQuery(`SELECT payload,fingerprint.*LIMIT 2`).WithArgs("NSE:KCB").WillReturnRows(sqlmock.NewRows([]string{"payload", "fingerprint", "at"}).AddRow([]byte(`{"revenue":100,"fiscalYear":2025}`), strings.Repeat("a", 64), "2026-10-12T12:00:00.000Z").AddRow([]byte(`{"fiscalYear":2024,"revenue":90}`), strings.Repeat("b", 64), "2026-10-11T12:00:00.000Z"))
	m.ExpectCommit()
	raw, err := repo.Observe(context.Background(), "NSE:KCB", json.RawMessage(`{"fiscalYear":2025,"revenue":100}`))
	if err != nil || !strings.Contains(string(raw), "2026-10-11") || !strings.Contains(string(calc.previous), "2024") {
		t.Fatal(string(raw), err)
	}
}
func TestSnapshotCalculationFailureRollsBackInsertedObservation(t *testing.T) {
	repo, m, calc := observationFixture(t)
	calc.failChanges = true
	observationPrefix(m)
	m.ExpectQuery(`SELECT payload,fingerprint`).WillReturnRows(sqlmock.NewRows([]string{"payload", "fingerprint", "at"}))
	m.ExpectExec(`INSERT INTO market.engine_snapshots`).WillReturnResult(sqlmock.NewResult(1, 1))
	m.ExpectRollback()
	if _, err := repo.Observe(context.Background(), "NSE:KCB", json.RawMessage(`{"newsIds":[],"ownership":[]}`)); err == nil {
		t.Fatal("failed observation committed")
	}
}
