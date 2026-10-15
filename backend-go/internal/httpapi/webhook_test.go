package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWebhookDelegatesRawRequestWithoutPublicKeyOrUserVerification(t *testing.T) {
	s := New(nil, nil)
	calls := 0
	s.PaymentWebhook = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("X-Paystack-Signature") == "" {
			w.WriteHeader(401)
			return
		}
		w.WriteHeader(200)
	})
	r := httptest.NewRequest("POST", "/api/v1/billing/paystack/webhook", nil)
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 401 || calls != 1 {
		t.Fatal(w.Code, calls)
	}
	r.Header.Set("X-Paystack-Signature", "fixture")
	w = httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 200 || calls != 2 || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal(w.Code, calls)
	}
	s.PaymentWebhook = nil
	w = httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 503 {
		t.Fatal(w.Code)
	}
}
