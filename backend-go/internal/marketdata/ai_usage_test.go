package marketdata

import (
	"context"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"testing"
)

func TestAIApplicationBudgetAndUserLimitsAreLockedBeforeReservation(t *testing.T) {
	for _, tc := range []struct {
		spent         float64
		daily, hourly int
		want          error
	}{{5, 0, 0, ErrAIMonthlyBudget}, {0, 20, 0, ErrAIRequestLimit}, {0, 0, 5, ErrAIRequestLimit}} {
		s, m := mockStore(t)
		m.ExpectBegin()
		m.ExpectExec(`SELECT pg_advisory_xact_lock`).WillReturnResult(sqlmock.NewResult(0, 1))
		m.ExpectQuery(`SELECT COALESCE.*WHERE user_id=\$1`).WithArgs("owner-a").WillReturnRows(sqlmock.NewRows([]string{"spent", "daily", "hourly"}).AddRow(tc.spent, tc.daily, tc.hourly))
		m.ExpectRollback()
		_, e := s.ReserveAI(context.Background(), "owner-a", "fixture-model", .01, 5, 20)
		if !errors.Is(e, tc.want) {
			t.Fatal(e)
		}
	}
}
func TestAIReservationFailureNeverRefundsUnknownProviderWork(t *testing.T) {
	s, m := mockStore(t)
	m.ExpectExec(`UPDATE market.engine_ai_usage SET status=\$2,input_tokens=\$3,output_tokens=\$4 WHERE id=\$1`).WithArgs("fixture-id", "failed", nil, nil).WillReturnResult(sqlmock.NewResult(0, 1))
	if e := s.FinishAI(context.Background(), "fixture-id", "failed", nil, nil); e != nil {
		t.Fatal(e)
	}
}
