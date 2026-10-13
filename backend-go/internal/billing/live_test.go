package billing

import (
	"context"
	"encoding/json"
	"github.com/DATA-DOG/go-sqlmock"
	"strings"
	"testing"
)

type fakeLiveStore struct {
	*fakeCheckoutStore
	order *Order
}

func (f *fakeLiveStore) CreateLive(_ context.Context, user, email string, a Agreement) (Order, error) {
	amount, _ := PriceMinor(a.Plan, a.Cycle)
	policy := PolicyVersion
	f.order = &Order{Reference: strings.Replace(fixtureRef, "test", "live", 1), Mode: "live", UserID: user, Email: email, Plan: a.Plan, Cycle: a.Cycle, AmountMinor: amount, TermsVersion: &policy}
	return *f.order, nil
}
func (f *fakeLiveStore) FindLive(_ context.Context, ref, user string) (*Order, error) {
	if f.order == nil || f.order.Reference != ref || (user != "" && user != f.order.UserID) {
		return nil, nil
	}
	return f.order, nil
}
func TestAgreementStrictAndProviderURLAllowlist(t *testing.T) {
	for _, extra := range []string{`,"card_number":"4111"`, `,"paymentMethod":null`, `,"paymentMethod":"mpesa"`} {
		raw := `{"plan":"premium","cycle":"monthly","accepted":true,"policyVersion":"` + PolicyVersion + `"` + extra + `}`
		if _, e := DecodeAgreement(strings.NewReader(raw)); e == nil {
			t.Fatal("invalid agreement accepted", extra)
		}
	}
	for _, value := range []string{"http://checkout.paystack.com/x", "https://checkout.paystack.com.evil.test/x", "https://user@checkout.paystack.com/x", "https://checkout.paystack.com:123/x"} {
		if ValidCheckoutURL(value) {
			t.Fatal("unsafe checkout URL accepted")
		}
	}
	if !ValidCheckoutURL("https://checkout.paystack.com/fixture") {
		t.Fatal("valid URL rejected")
	}
}
func TestLegacyLiveOrderRecoveryPreservesOwnershipAndReceipt(t *testing.T) {
	s, base, p := setupService()
	live := &fakeLiveStore{fakeCheckoutStore: base}
	s.Store = live
	s.Config.LiveEnabled = true
	s.Config.LiveKey = "sk_live_fixture"
	s.Config.CallbackURL = "https://example.test/checkout"
	input := Agreement{Plan: "premium_plus", Cycle: "monthly", Accepted: true, PolicyVersion: PolicyVersion}
	p.handler = func(path string, body any) (json.RawMessage, error) {
		b := body.(map[string]any)
		if path != "/transaction/initialize" || b["amount"] != int64(100000) {
			t.Fatal("untrusted legacy amount")
		}
		return json.RawMessage(`{"reference":"` + live.order.Reference + `","authorization_url":"https://checkout.paystack.com/fixture","access_code":"fixture"}`), nil
	}
	if _, e := s.InitializeLive(context.Background(), "user", "fixture@example.test", input); e != nil {
		t.Fatal(e)
	}
	calls := p.calls
	if _, e := s.VerifyLive(context.Background(), live.order.Reference, "other"); Status(e) != 404 || p.calls != calls {
		t.Fatal("legacy ownership bypass", e)
	}
	p.handler = func(string, any) (json.RawMessage, error) {
		return verificationResponse(Attempt{Order: *live.order}, "success", false), nil
	}
	base.entitlement = map[string]any{"expiresAt": "2026-11-13T08:00:00Z", "receiptNumber": "CONT-123"}
	got, e := s.VerifyLive(context.Background(), live.order.Reference, "user")
	if e != nil || got["receiptNumber"] != "CONT-123" || got["membershipChanged"] != true || got["paymentMethod"] != nil || base.testPaid != 0 {
		t.Fatal(got, e)
	}
	body := `{"event":"charge.success","data":{"reference":"` + live.order.Reference + `"}}`
	if w := signedWebhook(t, s, body, s.Config.LiveKey); w.Code != 200 {
		t.Fatal("legacy webhook lost receipt", w.Code, w.Body.String())
	}
}
func TestSQLLegacyLookupPreservesRecordedPolicyAndOwner(t *testing.T) {
	s, m := mockBillingDB(t)
	ref := strings.Replace(fixtureRef, "test", "live", 1)
	m.ExpectQuery(`SELECT .*paystack_live_orders WHERE reference=\$1 AND user_id=\$2`).WithArgs(ref, "user").WillReturnRows(sqlmock.NewRows([]string{"reference", "user_id", "email", "plan", "cycle", "amount_minor", "terms_version"}).AddRow(ref, "user", "fixture@example.test", "premium_plus", "monthly", 100000, "older-policy"))
	o, e := s.FindLive(context.Background(), ref, "user")
	if e != nil || o.Mode != "live" || *o.TermsVersion != "older-policy" {
		t.Fatal(o, e)
	}
}
func TestSQLLiveFulfillmentUsesExistingAtomicFunction(t *testing.T) {
	s, m := mockBillingDB(t)
	a := attemptFixture()
	a.Mode = "live"
	a.Reference = strings.Replace(fixtureRef, "test", "live", 1)
	paid := "2026-10-13T08:00:00Z"
	m.ExpectQuery(`SELECT public.fulfill_paystack_live_order`).WithArgs(a.Reference, int64(123), paid).WillReturnRows(sqlmock.NewRows([]string{"receipt"}).AddRow(`{"expiresAt":"2026-11-13T08:00:00Z","receiptNumber":"CONT-123"}`))
	got, e := s.FulfillLive(context.Background(), a.Order, Transaction{ID: 123, Status: "success", PaidAt: &paid})
	if e != nil || got["receiptNumber"] != "CONT-123" {
		t.Fatal(got, e)
	}
}
