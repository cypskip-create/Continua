package billing

import (
	"context"
	"continua/backend/internal/auth"
	"encoding/json"
	"github.com/DATA-DOG/go-sqlmock"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAccountCheckoutRequiresVerifiedIdentityAndRejectsClientOwnedFields(t *testing.T) {
	s, store, p := setupService()
	raw, _ := json.Marshal(checkoutFixture())
	request := func(body string, id *auth.Identity) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/api/v1/billing/native-checkout", strings.NewReader(body))
		w := httptest.NewRecorder()
		if !s.AccountHTTP(context.Background(), w, r, id) {
			t.Fatal("route not handled")
		}
		return w
	}
	if w := request(string(raw), nil); w.Code != 401 {
		t.Fatal("unauthenticated checkout", w.Code)
	}
	forged := strings.TrimSuffix(string(raw), "}") + `,"amount":1,"userId":"forged","card_number":"4111"}`
	if w := request(forged, &auth.Identity{UserID: "user", Email: "fixture@example.test"}); w.Code != 400 {
		t.Fatal("untrusted checkout fields", w.Code)
	}
	if store.reserves != 0 || p.calls != 0 {
		t.Fatal("invalid input reached money processing")
	}
	if w := request(string(raw), &auth.Identity{UserID: "user", Email: "fixture@example.test"}); w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestAccountVerifyEnforcesOwnerAndDoesNotExposeInternalErrors(t *testing.T) {
	s, store, _ := setupService()
	_, _ = s.Initialize(context.Background(), "user", "fixture@example.test", checkoutFixture())
	r := httptest.NewRequest("GET", "/api/v1/billing/native-verify/"+fixtureRef, nil)
	w := httptest.NewRecorder()
	s.AccountHTTP(context.Background(), w, r, &auth.Identity{UserID: "other"})
	if w.Code != 404 || store.testPaid != 0 {
		t.Fatal(w.Code, w.Body.String())
	}
	store.failReserve = true
	raw, _ := json.Marshal(checkoutFixture())
	r = httptest.NewRequest("POST", "/api/v1/billing/native-checkout", strings.NewReader(string(raw)))
	w = httptest.NewRecorder()
	s.AccountHTTP(context.Background(), w, r, &auth.Identity{UserID: "user", Email: "fixture@example.test"})
	if w.Code != 500 || strings.Contains(w.Body.String(), "fixture database") {
		t.Fatal("database error leaked", w.Body.String())
	}
}
func TestSQLRenewalSettingsAreOwnerAndModeScoped(t *testing.T) {
	store, m := mockBillingDB(t)
	m.ExpectQuery(`SELECT row_to_json`).WithArgs("owner", "test").WillReturnRows(sqlmock.NewRows([]string{"data"}).AddRow(`{"enabled":true,"plan":"premium_plus","nextChargeAt":"2026-11-13T08:00:00.000Z","processing":false}`))
	data, e := store.GetRenewal(context.Background(), "owner", "test")
	if e != nil || !strings.Contains(string(data), `"processing":false`) {
		t.Fatal(string(data), e)
	}
	m.ExpectExec(`UPDATE public.paystack_card_renewals SET enabled=false WHERE user_id=\$1 AND mode=\$2`).WithArgs("owner", "test").WillReturnResult(sqlmock.NewResult(0, 1))
	if e := store.DisableRenewal(context.Background(), "owner", "test"); e != nil {
		t.Fatal(e)
	}
}
