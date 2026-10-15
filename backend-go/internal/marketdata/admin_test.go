package marketdata

import (
	"context"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

func TestRejectedReviewUsesLockedAtomicTransition(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectBegin()
	m.ExpectQuery(`SELECT status.*FOR UPDATE`).WithArgs("1").WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow("confirmed"))
	m.ExpectRollback()
	if err := s.RejectCandidate(context.Background(), "1", nil); !errors.Is(err, ErrCandidateReviewed) {
		t.Fatal(err)
	}
	m.ExpectBegin()
	m.ExpectQuery(`SELECT status.*FOR UPDATE`).WithArgs("2").WillReturnRows(sqlmock.NewRows([]string{"status"}).AddRow("pending"))
	m.ExpectExec(`UPDATE market.financial_statement_candidates SET status='rejected'`).WithArgs("2", nil).WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectCommit()
	if err := s.RejectCandidate(context.Background(), "2", nil); err != nil {
		t.Fatal(err)
	}
}
