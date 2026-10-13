package billing

import (
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

func signedWebhook(t *testing.T, s *Service, body, key string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest("POST", "/api/v1/billing/paystack/webhook", strings.NewReader(body))
	mac := hmac.New(sha512.New, []byte(key))
	mac.Write([]byte(body))
	r.Header.Set("x-paystack-signature", hex.EncodeToString(mac.Sum(nil)))
	w := httptest.NewRecorder()
	s.Webhook(w, r)
	return w
}
func TestWebhookRejectsSignatureBeforeParsingAndModeMismatch(t *testing.T) {
	s, _, p := setupService()
	if w := signedWebhook(t, s, `not json`, "wrong"); w.Code != 401 {
		t.Fatal(w.Code)
	}
	if w := signedWebhook(t, s, `not json`, s.Config.TestKey); w.Code != 400 {
		t.Fatal(w.Code)
	}
	if w := signedWebhook(t, s, `{"event":"charge.success","data":{"reference":"`+strings.Replace(fixtureRef, "test", "live", 1)+`"}}`, s.Config.TestKey); w.Code != 401 {
		t.Fatal(w.Code)
	}
	if p.calls != 0 {
		t.Fatal("untrusted webhook reached provider")
	}
}
func TestWebhookReverifiesProviderAndNeverTrustsPayload(t *testing.T) {
	s, store, p := setupService()
	_, _ = s.Initialize(context.Background(), "user", "fixture@example.test", checkoutFixture())
	p.handler = func(string, any) (json.RawMessage, error) {
		return verificationResponse(*store.attempt, "success", false), nil
	}
	body := `{"event":"charge.success","data":{"reference":"` + fixtureRef + `","amount":1,"user_id":"forged"}}`
	w := signedWebhook(t, s, body, s.Config.TestKey)
	if w.Code != 200 || store.testPaid != 1 || store.livePaid != 0 {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestWebhookProviderFailureRemainsRetryable(t *testing.T) {
	s, _, p := setupService()
	_, _ = s.Initialize(context.Background(), "user", "fixture@example.test", checkoutFixture())
	p.handler = func(string, any) (json.RawMessage, error) { return nil, problem(502, "secret fixture provider detail") }
	w := signedWebhook(t, s, `{"event":"charge.success","data":{"reference":"`+fixtureRef+`"}}`, s.Config.TestKey)
	if w.Code != 502 || strings.Contains(w.Body.String(), "secret") {
		t.Fatal(w.Code, w.Body.String())
	}
}

func TestWebhookIgnoresValidUnrelatedEventShapes(t *testing.T) {
	s, _, p := setupService()
	for _, body := range []string{`null`, `[]`, `"event"`, `{"event":123}`, `{"event":"charge.success","data":{"reference":42}}`, `{"event":"other"}`} {
		if w := signedWebhook(t, s, body, s.Config.TestKey); w.Code != 200 {
			t.Fatal(body, w.Code, w.Body.String())
		}
	}
	if p.calls != 0 {
		t.Fatal("unrelated event contacted provider")
	}
}
