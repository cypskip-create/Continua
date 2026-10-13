package billing

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/DATA-DOG/go-sqlmock"
	"strings"
	"testing"
	"time"
)

type fakeRenewalStore struct {
	*fakeCheckoutStore
	initiate bool
	reserved int
	cipher   string
}

func (f *fakeRenewalStore) DueRenewals(context.Context, string) ([]RenewalCandidate, error) {
	return []RenewalCandidate{{"user", "test"}}, nil
}
func (f *fakeRenewalStore) ReserveRenewal(context.Context, RenewalCandidate) (*RenewalReservation, error) {
	f.reserved++
	r := &RenewalReservation{Reference: fixtureRef, UserID: "user", Email: "fixture@example.test", Mode: "test", AuthorizationCipher: f.cipher, AmountMinor: 100000, Initiate: f.initiate}
	f.initiate = false
	return r, nil
}
func TestRenewalAmbiguousChargeIsNotRepeated(t *testing.T) {
	s, base, p := setupService()
	s.Config.RenewalEnabled = true
	s.Config.EncryptionKey = strings.Repeat("a", 64)
	a := attemptFixture()
	a.Method = "card"
	a.State = "unknown"
	base.attempt = &a
	token, _ := EncryptAuthorization("AUTH_fixture", s.Config.EncryptionKey)
	store := &fakeRenewalStore{fakeCheckoutStore: base, initiate: true, cipher: token}
	charges := 0
	p.handler = func(path string, body any) (json.RawMessage, error) {
		if path == "/transaction/charge_authorization" {
			charges++
			b := body.(map[string]any)
			if b["authorization_code"] != "AUTH_fixture" || b["amount"] != int64(100000) {
				t.Fatal("wrong renewal body")
			}
			return nil, context.DeadlineExceeded
		}
		return verificationResponse(a, "pending", false), nil
	}
	w := RenewalWorker{Service: s, Store: store}
	for range 2 {
		if e := w.Run(context.Background()); e != nil {
			t.Fatal(e)
		}
	}
	if charges != 1 || base.unknowns != 1 || store.reserved != 2 {
		t.Fatal("renewal recharged", charges, base.unknowns)
	}
}
func TestRenewalDisabledOrAlreadyRunningDoesNotCollect(t *testing.T) {
	s, base, p := setupService()
	store := &fakeRenewalStore{fakeCheckoutStore: base}
	w := RenewalWorker{Service: s, Store: store}
	if e := w.Run(context.Background()); e != nil {
		t.Fatal(e)
	}
	s.Config.RenewalEnabled = true
	s.Config.EncryptionKey = strings.Repeat("a", 64)
	w.running.Store(true)
	if e := w.Run(context.Background()); e != nil {
		t.Fatal(e)
	}
	if store.reserved != 0 || p.calls != 0 {
		t.Fatal("disabled/overlapping worker charged")
	}
}
func TestRenewalTimerStopsWithoutChargeOnCancellation(t *testing.T) {
	s, base, p := setupService()
	store := &fakeRenewalStore{fakeCheckoutStore: base}
	w := RenewalWorker{Service: s, Store: store}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	done := make(chan struct{})
	go func() { w.Start(ctx); close(done) }()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("scheduler did not stop")
	}
	if p.calls != 0 {
		t.Fatal("scheduler charged at startup")
	}
}
func renewalRows(active any, enabled bool, next time.Time, plan string) *sqlmock.Rows {
	return sqlmock.NewRows([]string{"user_id", "mode", "email", "plan", "authorization_cipher", "consent_reference", "enabled", "next_charge_at", "active_reference"}).AddRow("user", "test", "fixture@example.test", plan, "encrypted", fixtureRef, enabled, next, active)
}
func renewalPrefix(m sqlmock.Sqlmock, rows *sqlmock.Rows) {
	m.ExpectBegin()
	m.ExpectExec(`SELECT pg_advisory_xact_lock`).WithArgs("billing:test:user").WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectQuery(`SELECT .*FROM public.paystack_card_renewals .*FOR UPDATE`).WithArgs("user", "test").WillReturnRows(rows)
}
func TestSQLRenewalExistingReferenceIsVerificationOnlyEvenIfDisabled(t *testing.T) {
	s, m := mockBillingDB(t)
	renewalPrefix(m, renewalRows(fixtureRef, false, time.Now().Add(time.Hour), "premium_plus"))
	m.ExpectCommit()
	r, e := s.ReserveRenewal(context.Background(), RenewalCandidate{"user", "test"})
	if e != nil || r == nil || r.Initiate || r.Reference != fixtureRef {
		t.Fatal(r, e)
	}
}
func TestSQLRenewalFutureOrDisabledReservationDoesNotCharge(t *testing.T) {
	for _, enabled := range []bool{true, false} {
		s, m := mockBillingDB(t)
		renewalPrefix(m, renewalRows(nil, enabled, time.Now().Add(time.Hour), "premium_plus"))
		m.ExpectRollback()
		r, e := s.ReserveRenewal(context.Background(), RenewalCandidate{"user", "test"})
		if e != nil || r != nil {
			t.Fatal(r, e)
		}
	}
}
func TestSQLRenewalDowngradeCancelsOldMandate(t *testing.T) {
	s, m := mockBillingDB(t)
	renewalPrefix(m, renewalRows(nil, true, time.Now().Add(-time.Hour), "premium"))
	m.ExpectQuery(`SELECT public.effective_subscription_plan`).WillReturnRows(sqlmock.NewRows([]string{"plan"}).AddRow("premium_plus"))
	m.ExpectExec(`UPDATE public.paystack_card_renewals SET enabled=false`).WithArgs("user", "test").WillReturnResult(sqlmock.NewResult(0, 1))
	m.ExpectCommit()
	r, e := s.ReserveRenewal(context.Background(), RenewalCandidate{"user", "test"})
	if e != nil || r != nil {
		t.Fatal(r, e)
	}
}
func TestSQLRenewalReservationRecordsOrderAndActiveReferenceAtomically(t *testing.T) {
	for _, fail := range []bool{false, true} {
		s, m := mockBillingDB(t)
		renewalPrefix(m, renewalRows(nil, true, time.Now().Add(-time.Hour), "premium_plus"))
		m.ExpectQuery(`SELECT public.effective_subscription_plan`).WillReturnRows(sqlmock.NewRows([]string{"plan"}).AddRow("free"))
		m.ExpectQuery(`SELECT EXISTS`).WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
		m.ExpectExec(`INSERT INTO public.paystack_native_attempts`).WillReturnResult(sqlmock.NewResult(0, 1))
		m.ExpectExec(`INSERT INTO public.paystack_test_orders`).WillReturnResult(sqlmock.NewResult(0, 1))
		update := m.ExpectExec(`UPDATE public.paystack_card_renewals SET active_reference`)
		if fail {
			update.WillReturnError(errors.New("fixture DB failure"))
			m.ExpectRollback()
		} else {
			update.WillReturnResult(sqlmock.NewResult(0, 1))
			m.ExpectCommit()
		}
		r, e := s.ReserveRenewal(context.Background(), RenewalCandidate{"user", "test"})
		if fail {
			if e == nil || r != nil {
				t.Fatal("partial renewal committed")
			}
		} else if e != nil || r == nil || !r.Initiate || r.AmountMinor != 100000 {
			t.Fatal(r, e)
		}
	}
}
