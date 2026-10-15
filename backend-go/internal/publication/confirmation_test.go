package publication

import (
	"context"
	"continua/backend/internal/engine"
	"database/sql"
	"encoding/json"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"os"
	"path/filepath"
	"testing"
)

func fixture(t *testing.T) (*Service, sqlmock.Sqlmock) {
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
	return &Service{DB: db}, m
}
func confirmation() Confirmation {
	id := "NSE:KCB"
	return Confirmation{SecurityID: &id, StatementType: "income", UnitsVerified: true, Periods: []Column{{ColumnIndex: 0, Period: Period{PeriodType: "annual", FiscalYear: 2025, PeriodEnd: "2025-12-31", ReportedAt: "2026-03-01", Currency: "KES"}, Income: map[string]float64{"revenue": 100, "netIncome": 20}, SourcePage: 1, Note: "Verified source and units."}}}
}
func prefix(m sqlmock.Sqlmock) {
	m.ExpectBegin()
	m.ExpectQuery(`SELECT status,security_id,document_url,detected_table.*FOR UPDATE`).WithArgs("7").WillReturnRows(sqlmock.NewRows([]string{"status", "security_id", "document_url", "detected_table"}).AddRow("pending", "NSE:KCB", "https://fixture.example/report.pdf", []byte(`{"rows":[{"label":"Revenue","values":["100"]}]}`)))
	m.ExpectQuery(`SELECT symbol FROM market.securities`).WithArgs("NSE:KCB").WillReturnRows(sqlmock.NewRows([]string{"symbol"}).AddRow("KCB"))
	m.ExpectExec(`pg_advisory_xact_lock`).WithArgs("canonical-research:NSE:KCB").WillReturnResult(sqlmock.NewResult(0, 0))
	m.ExpectExec(`pg_advisory_xact_lock`).WithArgs("NSE:period:KCB:2025").WillReturnResult(sqlmock.NewResult(0, 1))
}
func TestPublishExistingStatementCannotBeSilentlyReplaced(t *testing.T) {
	s, m := fixture(t)
	prefix(m)
	m.ExpectQuery(`SELECT p.period_type.*FOR UPDATE OF p`).WithArgs("NSE:period:KCB:2025").WillReturnRows(sqlmock.NewRows([]string{"type", "end", "currency", "reported", "statement"}).AddRow("annual", "2025-12-31", "KES", "2026-03-01", []byte(`{"revenue":99}`)))
	m.ExpectRollback()
	tx, err := s.DB.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.Publish(context.Background(), tx, "7", confirmation())
	tx.Rollback()
	var conflict *Error
	if !errors.As(err, &conflict) || conflict.Status != 409 {
		t.Fatal(err)
	}
}
func TestPublishAtomicPeriodStatementAndEvidence(t *testing.T) {
	s, m := fixture(t)
	prefix(m)
	m.ExpectQuery(`SELECT p.period_type.*FOR UPDATE OF p`).WithArgs("NSE:period:KCB:2025").WillReturnError(sql.ErrNoRows)
	m.ExpectExec(`INSERT INTO market.financial_periods`).WithArgs("NSE:period:KCB:2025", "NSE:KCB", "annual", 2025, nil, "2025-12-31", "2026-03-01", "KES").WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectExec(`INSERT INTO market.income_statements\(period_id,revenue,net_income\)`).WithArgs("NSE:period:KCB:2025", 100.0, 20.0).WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectExec(`INSERT INTO market.filing_history_reviews`).WithArgs("7", "NSE:period:KCB:2025", 0, "income", "https://fixture.example/report.pdf", 1, "Verified source and units.", `{"netIncome":20,"revenue":100}`, "null").WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectExec(`UPDATE market.financial_statement_candidates`).WithArgs("7", "Historical columns reviewed: 0", "NSE:period:KCB:2025").WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectCommit()
	tx, err := s.DB.BeginTx(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	result, err := s.Publish(context.Background(), tx, "7", confirmation())
	if err != nil {
		tx.Rollback()
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if len(result.PeriodIDs) != 1 || result.SourceURL != "https://fixture.example/report.pdf" {
		t.Fatal(result)
	}
}
func TestConfirmationValidatesRealPythonBeforeTransaction(t *testing.T) {
	python := os.Getenv("NATIVE_PYTHON_BIN")
	if python == "" {
		t.Skip("native Python required")
	}
	s, _ := fixture(t)
	script, _ := filepath.Abs("../../../engine-python/worker.py")
	s.Worker = engine.NewWorker(python, script)
	_, err := s.Confirm(context.Background(), "7", json.RawMessage(`{"unitsVerified":false}`))
	if !errors.Is(err, ErrInvalidConfirmation) {
		t.Fatal(err)
	}
	b, err := s.validate(context.Background(), json.RawMessage(`{"statementType":"income","unitsVerified":true,"periods":[{"columnIndex":0.0,"period":{"periodType":"annual","fiscalYear":2025.0,"periodEnd":"2025-12-31","reportedAt":"2026-03-01","currency":"KES"},"income":{"revenue":100,"netIncome":20},"sourcePage":1.0,"note":"Verified source values."}]}`))
	if err != nil || len(b.Periods) != 1 || b.Periods[0].Period.FiscalYear != 2025 {
		t.Fatal(b, err)
	}
}
