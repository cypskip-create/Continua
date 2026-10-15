package publication

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

func TestCandidateBridgeRejectsNullAndNonStringLabels(t *testing.T) {
	s, m := fixture(t)
	row := candidateExtraction{ID: 2, ArtifactID: 1, Source: "fixture", URL: "https://fixture.example/a", Entity: json.RawMessage(`{}`), Tables: json.RawMessage(`[{"rows":[{"label":null,"values":["10"]}]},{"rows":[{"label":7,"values":["10"]}]},{"rows":[{"label":"Revenue","values":null}]},{"rows":[{"label":"Revenue","values":["10"]}]}]`)}
	m.ExpectQuery(`SELECT table_index`).WillReturnRows(sqlmock.NewRows([]string{"table_index"}))
	m.ExpectExec(`INSERT INTO market.financial_statement_candidates`).WillReturnResult(sqlmock.NewResult(1, 1))
	count, resolved, err := s.bridgeExtraction(context.Background(), "NSE", row)
	if err != nil || count != 1 || resolved {
		t.Fatalf("count=%d resolved=%v error=%v", count, resolved, err)
	}
}

func TestCandidateBridgeUnavailableResolverFailsClosed(t *testing.T) {
	s, _ := fixture(t)
	title := "Example Issuer"
	_, _, err := s.bridgeExtraction(context.Background(), "NSE", candidateExtraction{Title: &title, Entity: json.RawMessage(`{}`), Tables: json.RawMessage(`[]`)})
	if err == nil {
		t.Fatal("missing resolver accepted")
	}
}

func TestCandidateBridgeRetainsCountBeforePersistenceFailure(t *testing.T) {
	s, m := fixture(t)
	row := candidateExtraction{Entity: json.RawMessage(`{}`), Tables: json.RawMessage(`[{"rows":[]},{"rows":[]}]`)}
	m.ExpectQuery(`SELECT table_index`).WillReturnRows(sqlmock.NewRows([]string{"table_index"}))
	m.ExpectExec(`INSERT INTO market.financial_statement_candidates`).WillReturnResult(sqlmock.NewResult(1, 1))
	m.ExpectExec(`INSERT INTO market.financial_statement_candidates`).WillReturnError(errors.New("fixture unavailable"))
	count, _, err := s.bridgeExtraction(context.Background(), "NSE", row)
	if count != 1 || err == nil {
		t.Fatalf("count=%d err=%v", count, err)
	}
}

func TestCandidateBridgeResumesMissingTableWithoutRewritingReviewedOne(t *testing.T) {
	s, m := fixture(t)
	m.ExpectQuery(`SELECT table_index`).WithArgs(int64(2)).WillReturnRows(sqlmock.NewRows([]string{"table_index"}).AddRow(0))
	m.ExpectExec(`INSERT INTO market.financial_statement_candidates`).WillReturnResult(sqlmock.NewResult(1, 1))
	count, _, err := s.bridgeExtraction(context.Background(), "NSE", candidateExtraction{ID: 2, Entity: json.RawMessage(`{}`), Tables: json.RawMessage(`[{"rows":[]},{"rows":[]}]`)})
	if err != nil || count != 1 {
		t.Fatal(count, err)
	}
}
