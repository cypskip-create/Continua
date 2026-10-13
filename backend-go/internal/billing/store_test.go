package billing

import (
	"context"
	"database/sql"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"strings"
	"testing"
	"time"
)

func mockBillingDB(t *testing.T) (*SQLStore, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, e := sqlmock.New()
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() {
		if e := mock.ExpectationsWereMet(); e != nil {
			t.Error(e)
		}
		db.Close()
	})
	return &SQLStore{DB: db}, mock
}
func attemptRow(a Attempt) *sqlmock.Rows {
	var code any
	if a.AccessCode != nil {
		code = *a.AccessCode
	}
	return sqlmock.NewRows(strings.Split(attemptColumns, ",")).AddRow(a.Reference, a.UserID, a.Email, a.Mode, a.Plan, a.Cycle, a.AmountMinor, a.Method, a.State, a.IntentID, a.RequestHash, code, a.AutoRenew, a.EnrollmentProcessed, a.CreatedAt)
}
func reserveRequest() ReserveRequest {
	return ReserveRequest{UserID: "user", Email: "fixture@example.test", Mode: "test", Fingerprint: "hash", Input: checkoutFixture()}
}
func attemptFixture() Attempt {
	return Attempt{Order: Order{Reference: fixtureRef, UserID: "user", Email: "fixture@example.test", Mode: "test", Plan: "premium_plus", Cycle: "monthly", AmountMinor: 100000}, Method: "mpesa", State: "creating", IntentID: checkoutFixture().IntentID, RequestHash: "hash", CreatedAt: time.Now().UTC()}
}
func expectReservationPrefix(m sqlmock.Sqlmock) {
	m.ExpectBegin()
	m.ExpectExec(`SELECT pg_advisory_xact_lock`).WithArgs("billing:test:user").WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectQuery(`SELECT .*intent_id=\$3`).WithArgs("user", "test", checkoutFixture().IntentID).WillReturnError(sql.ErrNoRows)
	m.ExpectQuery(`SELECT .*state IN`).WithArgs("user", "test").WillReturnError(sql.ErrNoRows)
}
func TestSQLReservationCommitsBothRowsBeforeReturning(t *testing.T) {
	s, m := mockBillingDB(t)
	expectReservationPrefix(m)
	m.ExpectQuery(`SELECT public.effective_subscription_plan`).WithArgs("user").WillReturnRows(sqlmock.NewRows([]string{"plan"}).AddRow("free"))
	a := attemptFixture()
	m.ExpectQuery(`INSERT INTO public.paystack_native_attempts`).WithArgs(sqlmock.AnyArg(), "user", a.Email, "test", "premium_plus", "monthly", "mpesa", int64(100000), a.IntentID, "hash", false).WillReturnRows(attemptRow(a))
	m.ExpectExec(`INSERT INTO public.paystack_test_orders`).WithArgs(sqlmock.AnyArg(), "user", a.Email, "premium_plus", "monthly", int64(100000)).WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectCommit()
	result, e := s.Reserve(context.Background(), reserveRequest())
	if e != nil || !result.Created {
		t.Fatal(result, e)
	}
}
func TestSQLReservationRollsBackIfCompanionOrderFails(t *testing.T) {
	s, m := mockBillingDB(t)
	expectReservationPrefix(m)
	m.ExpectQuery(`SELECT public.effective_subscription_plan`).WillReturnRows(sqlmock.NewRows([]string{"plan"}).AddRow("free"))
	m.ExpectQuery(`INSERT INTO public.paystack_native_attempts`).WillReturnRows(attemptRow(attemptFixture()))
	m.ExpectExec(`INSERT INTO public.paystack_test_orders`).WillReturnError(errors.New("fixture failed"))
	m.ExpectRollback()
	result, e := s.Reserve(context.Background(), reserveRequest())
	if e == nil || result.Created {
		t.Fatal("partial reservation committed")
	}
}
func TestSQLSameIntentAndActiveAttemptNeverCreateNewOrder(t *testing.T) {
	for _, same := range []bool{true, false} {
		s, m := mockBillingDB(t)
		a := attemptFixture()
		m.ExpectBegin()
		m.ExpectExec(`SELECT pg_advisory_xact_lock`).WillReturnResult(sqlmock.NewResult(0, 1))
		query := m.ExpectQuery(`SELECT .*intent_id=\$3`)
		if same {
			query.WillReturnRows(attemptRow(a))
		} else {
			query.WillReturnError(sql.ErrNoRows)
			m.ExpectQuery(`SELECT .*state IN`).WillReturnRows(attemptRow(a))
		}
		m.ExpectCommit()
		result, e := s.Reserve(context.Background(), reserveRequest())
		if e != nil || result.Created || result.Attempt.Reference != fixtureRef {
			t.Fatal(result, e)
		}
	}
}
func TestSQLDowngradeAndChangedIntentRollback(t *testing.T) {
	s, m := mockBillingDB(t)
	a := attemptFixture()
	a.RequestHash = "changed"
	m.ExpectBegin()
	m.ExpectExec(`SELECT pg_advisory_xact_lock`).WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectQuery(`SELECT .*intent_id=\$3`).WillReturnRows(attemptRow(a))
	m.ExpectRollback()
	if _, e := s.Reserve(context.Background(), reserveRequest()); Status(e) != 409 {
		t.Fatal("changed intent accepted", e)
	}
	s, m = mockBillingDB(t)
	expectReservationPrefix(m)
	m.ExpectQuery(`SELECT public.effective_subscription_plan`).WillReturnRows(sqlmock.NewRows([]string{"plan"}).AddRow("premium_plus"))
	m.ExpectRollback()
	r := reserveRequest()
	r.Input.Plan = "premium"
	if _, e := s.Reserve(context.Background(), r); Status(e) != 409 {
		t.Fatal("downgrade accepted", e)
	}
}
func TestSQLFindAttemptFiltersVerifiedOwner(t *testing.T) {
	s, m := mockBillingDB(t)
	m.ExpectQuery(`WHERE reference=\$1 AND user_id=\$2`).WithArgs(fixtureRef, "other").WillReturnError(sql.ErrNoRows)
	a, e := s.FindAttempt(context.Background(), fixtureRef, "other")
	if e != nil || a != nil {
		t.Fatal(a, e)
	}
}
func TestSQLTestModeDoesNotCallLiveFulfillment(t *testing.T) {
	s, m := mockBillingDB(t)
	a := attemptFixture()
	t1 := Transaction{ID: 123, Status: "success"}
	m.ExpectExec(`UPDATE public.paystack_test_orders`).WithArgs(fixtureRef, int64(123)).WillReturnResult(sqlmock.NewResult(0, 1))
	if e := s.RecordTestPaid(context.Background(), a.Order, t1); e != nil {
		t.Fatal(e)
	}
	if _, e := s.FulfillLive(context.Background(), a.Order, t1); Status(e) != 409 {
		t.Fatal("test order could activate", e)
	}
	m.ExpectExec(`UPDATE public.paystack_test_orders`).WillReturnResult(sqlmock.NewResult(0, 0))
	if e := s.RecordTestPaid(context.Background(), a.Order, t1); Status(e) != 409 {
		t.Fatal("conflicting receipt accepted", e)
	}
}
func TestSQLPaidReservationCannotBeDemotedByDelayedFailure(t *testing.T) {
	s, m := mockBillingDB(t)
	m.ExpectBegin()
	m.ExpectQuery(`SELECT state .*FOR UPDATE`).WithArgs(fixtureRef).WillReturnRows(sqlmock.NewRows([]string{"state"}).AddRow("paid"))
	m.ExpectCommit()
	if e := s.Reconcile(context.Background(), attemptFixture(), "failed", nil); e != nil {
		t.Fatal(e)
	}
}
func TestSQLRenewalEnrollmentIsLockedAndIdempotent(t *testing.T) {
	s, m := mockBillingDB(t)
	m.ExpectBegin()
	m.ExpectQuery(`SELECT enrollment_processed .*FOR UPDATE`).WithArgs(fixtureRef).WillReturnRows(sqlmock.NewRows([]string{"enrollment_processed"}).AddRow(true))
	m.ExpectCommit()
	if e := s.Enroll(context.Background(), attemptFixture(), "encrypted", time.Now()); e != nil {
		t.Fatal(e)
	}
}
