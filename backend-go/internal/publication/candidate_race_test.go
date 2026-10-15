package publication

import (
	"context"
	"encoding/json"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

func TestConcurrentReviewedCandidateDoesNotChangeEvidenceOrClaimCreation(t *testing.T) {
	s, m := fixture(t)
	m.ExpectQuery(`SELECT table_index`).WillReturnRows(sqlmock.NewRows([]string{"table_index"}))
	m.ExpectExec(`INSERT INTO market.financial_statement_candidates.*WHERE market.financial_statement_candidates.status='pending'`).WillReturnResult(sqlmock.NewResult(0, 0))
	count, _, err := s.bridgeExtraction(context.Background(), "NSE", candidateExtraction{ID: 2, Entity: json.RawMessage(`{}`), Tables: json.RawMessage(`[{"rows":[{"label":"Revenue","values":["100"]}]}]`)})
	if err != nil || count != 0 {
		t.Fatal(count, err)
	}
}
