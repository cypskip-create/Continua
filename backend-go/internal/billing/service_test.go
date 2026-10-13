package billing

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"
)

const fixtureRef = "continua-test-11111111-1111-4111-8111-111111111111"

type fakeCheckoutStore struct {
	mu                                                                        sync.Mutex
	attempt                                                                   *Attempt
	reserves, initiations, unknowns, testPaid, livePaid, enrolled, reconciled int
	failReserve                                                               bool
	entitlement                                                               map[string]any
	lastState, encrypted                                                      string
}

func (f *fakeCheckoutStore) Reserve(ctx context.Context, r ReserveRequest) (Reservation, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reserves++
	if f.failReserve {
		return Reservation{}, errors.New("fixture database failure")
	}
	if f.attempt != nil {
		if f.attempt.IntentID == r.Input.IntentID && f.attempt.RequestHash != r.Fingerprint {
			return Reservation{}, problem(409, "Different details")
		}
		return Reservation{Attempt: *f.attempt}, nil
	}
	amount, _ := PriceMinor(r.Input.Plan, r.Input.Cycle)
	f.attempt = &Attempt{Order: Order{Reference: fixtureRef, Mode: r.Mode, UserID: r.UserID, Email: r.Email, Plan: r.Input.Plan, Cycle: r.Input.Cycle, AmountMinor: amount}, Method: r.Input.PaymentMethod, State: "creating", IntentID: r.Input.IntentID, RequestHash: r.Fingerprint, AutoRenew: r.Input.AutoRenew, CreatedAt: time.Date(2026, 10, 13, 8, 0, 0, 0, time.UTC)}
	return Reservation{Attempt: *f.attempt, Created: true}, nil
}
func (f *fakeCheckoutStore) Initiated(_ context.Context, _ string, c *string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.initiations++
	f.attempt.State = "pending"
	f.attempt.AccessCode = c
	return nil
}
func (f *fakeCheckoutStore) Unknown(ctx context.Context, _ string) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.unknowns++
	f.attempt.State = "unknown"
	return nil
}
func (f *fakeCheckoutStore) FindAttempt(_ context.Context, ref, user string) (*Attempt, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.attempt == nil || f.attempt.Reference != ref || (user != "" && f.attempt.UserID != user) {
		return nil, nil
	}
	a := *f.attempt
	return &a, nil
}
func (f *fakeCheckoutStore) FulfillLive(context.Context, Order, Transaction) (map[string]any, error) {
	f.livePaid++
	return f.entitlement, nil
}
func (f *fakeCheckoutStore) RecordTestPaid(context.Context, Order, Transaction) error {
	f.testPaid++
	return nil
}
func (f *fakeCheckoutStore) Reconcile(_ context.Context, _ Attempt, state string, _ *string) error {
	f.reconciled++
	f.lastState = state
	return nil
}
func (f *fakeCheckoutStore) Enroll(_ context.Context, _ Attempt, encrypted string, _ time.Time) error {
	f.enrolled++
	f.encrypted = encrypted
	return nil
}

type fakeProvider struct {
	mu      sync.Mutex
	calls   int
	handler func(string, any) (json.RawMessage, error)
}

func (f *fakeProvider) Call(_ context.Context, _ string, path string, body any) (json.RawMessage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	return f.handler(path, body)
}
func checkoutFixture() CheckoutInput {
	phone := "0712 345 678"
	return CheckoutInput{Plan: "premium_plus", Cycle: "monthly", PolicyVersion: PolicyVersion, Accepted: true, PaymentMethod: "mpesa", Phone: &phone, IntentID: "11111111-1111-4111-8111-111111111111"}
}
func setupService() (*Service, *fakeCheckoutStore, *fakeProvider) {
	store := new(fakeCheckoutStore)
	p := &fakeProvider{handler: func(string, any) (json.RawMessage, error) {
		return json.RawMessage(`{"reference":"` + fixtureRef + `"}`), nil
	}}
	s := &Service{Config: Config{Mode: "test", NativeEnabled: true, TestKey: "sk_test_fixture", TestUsers: map[string]bool{"user": true}}, Store: store, Provider: p}
	return s, store, p
}
func verificationResponse(a Attempt, status string, authorization bool) json.RawMessage {
	f := transactionFixture()
	f["domain"] = a.Mode
	f["reference"] = a.Reference
	f["status"] = status
	f["customer"] = map[string]any{"email": a.Email}
	f["metadata"] = map[string]any{"continua_reference": a.Reference, "continua_user": a.UserID, "mode": a.Mode}
	if authorization {
		f["authorization"] = map[string]any{"authorization_code": "AUTH_fixture", "channel": "card", "reusable": true}
	}
	raw, _ := json.Marshal(f)
	return raw
}
func TestInitializeDerivesTrustedAmountAndMobileProvider(t *testing.T) {
	for method, provider := range map[string]string{"mpesa": "mpesa", "airtel": "atl"} {
		s, store, p := setupService()
		input := checkoutFixture()
		input.PaymentMethod = method
		p.handler = func(path string, body any) (json.RawMessage, error) {
			b := body.(map[string]any)
			mobile := b["mobile_money"].(map[string]any)
			if path != "/charge" || b["amount"] != int64(100000) || b["currency"] != "KES" || mobile["provider"] != provider || *mobile["phone"].(*string) != "+254712345678" || store.attempt == nil {
				t.Fatal("charge without trusted reservation/body", b)
			}
			return json.RawMessage(`{"reference":"` + fixtureRef + `"}`), nil
		}
		got, e := s.Initialize(context.Background(), "user", "fixture@example.test", input)
		if e != nil || got["status"] != "pending" || got["amount"] != float64(1000) {
			t.Fatal(got, e)
		}
	}
}
func TestConcurrentAndRepeatedTapsOnlyInitiateOnce(t *testing.T) {
	s, store, p := setupService()
	var wg sync.WaitGroup
	for range 20 {
		wg.Go(func() {
			if _, e := s.Initialize(context.Background(), "user", "fixture@example.test", checkoutFixture()); e != nil {
				t.Error(e)
			}
		})
	}
	wg.Wait()
	if p.calls != 1 || store.initiations != 1 {
		t.Fatal("duplicate charge", p.calls, store.initiations)
	}
	changed := checkoutFixture()
	changed.Plan = "premium"
	if _, e := s.Initialize(context.Background(), "user", "fixture@example.test", changed); Status(e) != 409 {
		t.Fatal("intent mismatch accepted", e)
	}
}
func TestAmbiguousProviderFailureKeepsRecoveryAndNeverRecharges(t *testing.T) {
	s, store, p := setupService()
	p.handler = func(string, any) (json.RawMessage, error) { return nil, context.DeadlineExceeded }
	got, e := s.Initialize(context.Background(), "user", "fixture@example.test", checkoutFixture())
	if e != nil || got["status"] != "unknown" || got["reference"] != fixtureRef {
		t.Fatal(got, e)
	}
	_, e = s.Initialize(context.Background(), "user", "fixture@example.test", checkoutFixture())
	if e != nil || p.calls != 1 || store.unknowns != 1 {
		t.Fatal("retried ambiguous charge", e)
	}
}
func TestFailedReservationAndDisabledAccountDoNotReachProvider(t *testing.T) {
	s, store, p := setupService()
	store.failReserve = true
	if _, e := s.Initialize(context.Background(), "user", "fixture@example.test", checkoutFixture()); e == nil {
		t.Fatal("DB failure ignored")
	}
	if _, e := s.Initialize(context.Background(), "not-allowed", "fixture@example.test", checkoutFixture()); Status(e) != 503 {
		t.Fatal(e)
	}
	if p.calls != 0 {
		t.Fatal("provider contacted before reservation/gate")
	}
}
func TestTestReceiptNeverChangesMembershipAndOwnershipCheckedBeforeProvider(t *testing.T) {
	s, store, p := setupService()
	_, _ = s.Initialize(context.Background(), "user", "fixture@example.test", checkoutFixture())
	p.handler = func(string, any) (json.RawMessage, error) {
		return verificationResponse(*store.attempt, "success", false), nil
	}
	calls := p.calls
	if _, e := s.Verify(context.Background(), fixtureRef, "other"); Status(e) != 404 || p.calls != calls {
		t.Fatal("owner bypass", e)
	}
	got, e := s.Verify(context.Background(), fixtureRef, "user")
	if e != nil || got["membershipChanged"] != false || got["status"] != "paid" || store.livePaid != 0 || store.testPaid != 1 {
		t.Fatal(got, e)
	}
}
func TestMismatchedReceiptDoesNotFulfillOrReconcile(t *testing.T) {
	s, store, p := setupService()
	_, _ = s.Initialize(context.Background(), "user", "fixture@example.test", checkoutFixture())
	p.handler = func(string, any) (json.RawMessage, error) {
		raw := verificationResponse(*store.attempt, "success", false)
		return json.RawMessage(strings.Replace(string(raw), `"amount":100000`, `"amount":1`, 1)), nil
	}
	if _, e := s.Verify(context.Background(), fixtureRef, "user"); Status(e) != 409 || store.livePaid != 0 || store.testPaid != 0 || store.reconciled != 0 {
		t.Fatal("mismatch accepted", e)
	}
}
func TestInlineDeclinePreservesReservationAndNeverCollectsCardDetails(t *testing.T) {
	s, store, p := setupService()
	input := checkoutFixture()
	input.PaymentMethod = "card"
	input.Phone = nil
	p.handler = func(path string, body any) (json.RawMessage, error) {
		b := body.(map[string]any)
		if path != "/transaction/initialize" || b["mobile_money"] != nil {
			t.Fatal("incorrect card collection")
		}
		return json.RawMessage(`{"reference":"` + fixtureRef + `","access_code":"fixture-access"}`), nil
	}
	_, e := s.Initialize(context.Background(), "user", "fixture@example.test", input)
	if e != nil {
		t.Fatal(e)
	}
	p.handler = func(string, any) (json.RawMessage, error) {
		return verificationResponse(*store.attempt, "failed", false), nil
	}
	got, e := s.Verify(context.Background(), fixtureRef, "user")
	if e != nil || got["status"] != "pending" || store.lastState != "pending" {
		t.Fatal(got, e)
	}
}
func TestRenewalRequiresSeparateVerifiedReusableToken(t *testing.T) {
	s, store, p := setupService()
	s.Config.RenewalEnabled = true
	s.Config.EncryptionKey = strings.Repeat("a", 64)
	input := checkoutFixture()
	input.PaymentMethod = "card"
	input.Phone = nil
	input.AutoRenew = true
	p.handler = func(string, any) (json.RawMessage, error) {
		return json.RawMessage(`{"reference":"` + fixtureRef + `","access_code":"fixture-access"}`), nil
	}
	_, e := s.Initialize(context.Background(), "user", "fixture@example.test", input)
	if e != nil {
		t.Fatal(e)
	}
	p.handler = func(string, any) (json.RawMessage, error) {
		return verificationResponse(*store.attempt, "success", true), nil
	}
	got, e := s.Verify(context.Background(), fixtureRef, "")
	if e != nil || got["accessCode"] != nil || store.enrolled != 1 || strings.Contains(store.encrypted, "AUTH_") {
		t.Fatal(got, e)
	}
	token, e := DecryptAuthorization(store.encrypted, s.Config.EncryptionKey)
	if e != nil || token != "AUTH_fixture" {
		t.Fatal(e)
	}
}
func TestLiveActivationOnlyAfterVerifiedSuccess(t *testing.T) {
	s, store, p := setupService()
	_, _ = s.Initialize(context.Background(), "user", "fixture@example.test", checkoutFixture())
	store.attempt.Mode = "live"
	store.attempt.Reference = strings.Replace(fixtureRef, "test", "live", 1)
	s.Config.LiveEnabled = true
	s.Config.LiveKey = "sk_live_fixture"
	s.Config.CallbackURL = "https://example.test/checkout"
	p.handler = func(string, any) (json.RawMessage, error) {
		return verificationResponse(*store.attempt, "success", false), nil
	}
	if _, e := s.Verify(context.Background(), store.attempt.Reference, "user"); Status(e) != 503 {
		t.Fatal("empty fulfillment accepted", e)
	}
	store.entitlement = map[string]any{"expiresAt": "2026-11-13T08:00:00Z", "receiptNumber": "CONT-123"}
	got, e := s.Verify(context.Background(), store.attempt.Reference, "user")
	if e != nil || got["membershipChanged"] != true || got["receiptNumber"] != "CONT-123" || store.testPaid != 0 {
		t.Fatal(got, e)
	}
}
