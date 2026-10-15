package publication

import (
	"context"
	"continua/backend/internal/engine"
	"database/sql"
	"encoding/json"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

type planCalculator struct {
	raw string
	err error
}

func (c planCalculator) Calculate(context.Context, engine.Request) (json.RawMessage, error) {
	return json.RawMessage(c.raw), c.err
}

func documentPrefix(m sqlmock.Sqlmock) {
	m.ExpectBegin()
	m.ExpectQuery(`SELECT pg_try_advisory_xact_lock`).WithArgs(int64(7)).WillReturnRows(sqlmock.NewRows([]string{"locked"}).AddRow(true))
	m.ExpectQuery(`SELECT 1 FROM market.document_validations`).WithArgs(int64(7), DocumentValidatorVersion).WillReturnError(sql.ErrNoRows)
	m.ExpectQuery(`SELECT e.id,e.artifact_id,e.method,e.text,e.tables,e.needs_review`).WithArgs(int64(7)).WillReturnRows(sqlmock.NewRows([]string{"id", "artifact", "method", "text", "tables", "review", "observed", "sha", "url", "source", "title", "config"}).AddRow(7, 1, "native_pdf_text", "Fixture source", []byte(`[]`), false, "2026-10-11", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "https://www.nse.co.ke/fixture.pdf", "nse", nil, []byte(`{}`)))
	m.ExpectQuery(`SELECT s.id,s.company_id,c.name`).WillReturnRows(sqlmock.NewRows([]string{"id", "company_id", "name"}))
}

func TestAutomaticReviewCommitsEvidenceWithoutCanonicalWrites(t *testing.T) {
	s, m := fixture(t)
	s.DocumentWorker = planCalculator{raw: `{"valid":false,"reason":"Unknown source layout"}`}
	documentPrefix(m)
	m.ExpectExec(`SAVEPOINT canonical_publication`).WillReturnResult(sqlmock.NewResult(0, 0))
	m.ExpectExec(`INSERT INTO market.document_validations`).WithArgs(int64(7), DocumentValidatorVersion, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "https://www.nse.co.ke/fixture.pdf", "review", "Unknown source layout", "{}").WillReturnResult(sqlmock.NewResult(1, 1))
	m.ExpectCommit()
	outcome, changed, err := s.publishDocument(context.Background(), 7)
	if err != nil || outcome != "review" || changed != nil {
		t.Fatalf("%s %v %v", outcome, changed, err)
	}
}

func TestAutomaticWorkerOutageLeavesExtractionRetryable(t *testing.T) {
	s, m := fixture(t)
	s.DocumentWorker = planCalculator{err: errors.New("fixture worker unavailable")}
	documentPrefix(m)
	m.ExpectRollback()
	outcome, _, err := s.publishDocument(context.Background(), 7)
	if err == nil || outcome != "" {
		t.Fatal("worker failure was marked reviewed")
	}
}

func TestAutomaticAlreadyValidatedDoesNotRepeatPublication(t *testing.T) {
	s, m := fixture(t)
	m.ExpectBegin()
	m.ExpectQuery(`SELECT pg_try_advisory_xact_lock`).WillReturnRows(sqlmock.NewRows([]string{"locked"}).AddRow(true))
	m.ExpectQuery(`SELECT 1 FROM market.document_validations`).WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(1))
	m.ExpectRollback()
	outcome, _, err := s.publishDocument(context.Background(), 7)
	if err != nil || outcome != "" {
		t.Fatal(err)
	}
}

func TestAutomaticBondConflictRollsBackCanonicalSavepoint(t *testing.T) {
	s, m := fixture(t)
	s.DocumentWorker = planCalculator{raw: `{"valid":true,"kind":"bond","records":[{"id":"cbk:fixture","sourceUrl":"https://www.centralbank.go.ke/a.pdf","payload":{"yield":12}}]}`}
	documentPrefix(m)
	m.ExpectExec(`SAVEPOINT canonical_publication`).WillReturnResult(sqlmock.NewResult(0, 0))
	m.ExpectExec(`SELECT pg_advisory_xact_lock`).WithArgs("bond-publication:cbk:fixture").WillReturnResult(sqlmock.NewResult(0, 0))
	m.ExpectQuery(`SELECT source_url,payload FROM market.research_records`).WillReturnRows(sqlmock.NewRows([]string{"url", "payload"}).AddRow("https://www.centralbank.go.ke/a.pdf", []byte(`{"yield":13}`)))
	m.ExpectExec(`ROLLBACK TO SAVEPOINT canonical_publication`).WillReturnResult(sqlmock.NewResult(0, 0))
	m.ExpectExec(`INSERT INTO market.document_validations`).WithArgs(int64(7), DocumentValidatorVersion, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "https://www.nse.co.ke/fixture.pdf", "review", "Existing bond observation conflicts; review required", "{}").WillReturnResult(sqlmock.NewResult(1, 1))
	m.ExpectCommit()
	outcome, _, err := s.publishDocument(context.Background(), 7)
	if err != nil || outcome != "review" {
		t.Fatal(outcome, err)
	}
}

func TestAutomaticBatchQueriesIDsNotDocumentBodies(t *testing.T) {
	s, m := fixture(t)
	s.Worker = planCalculator{}
	s.DocumentWorker = planCalculator{}
	m.ExpectQuery(`SELECT e.id\s+FROM scraping.extractions`).WithArgs(DocumentValidatorVersion, 25, nil).WillReturnRows(sqlmock.NewRows([]string{"id"}))
	summary, err := s.AutomaticDocuments(context.Background(), 25, nil)
	if err != nil || summary.Published != 0 || summary.Failed != 0 {
		t.Fatal(summary, err)
	}
}
