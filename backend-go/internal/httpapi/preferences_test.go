package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

type preferencesFixture struct {
	calls        int
	user, symbol string
	reset        bool
}

func (f *preferencesFixture) Preferences(_ context.Context, user string) (json.RawMessage, error) {
	f.calls++
	f.user = user
	return json.RawMessage(`{"learnInterests":false,"interests":[]}`), nil
}
func (f *preferencesFixture) SavePreferences(_ context.Context, user string, _ json.RawMessage) (json.RawMessage, error) {
	f.calls++
	f.user = user
	return json.RawMessage(`{}`), nil
}
func (f *preferencesFixture) RecordInterest(_ context.Context, user, symbol, _ string, reset bool) (json.RawMessage, error) {
	f.calls++
	f.user = user
	f.symbol = symbol
	f.reset = reset
	return json.RawMessage(`{}`), nil
}
func TestPreferencesRequirePlusAndVerifiedOwner(t *testing.T) {
	s, _ := fixtureServer()
	store := new(preferencesFixture)
	s.PreferencesStore = store
	s.Engine = &calculationFixture{raw: json.RawMessage(`{}`)}
	for _, plan := range []string{"free", "premium", "premium_plus"} {
		r := httptest.NewRequest("GET", "/api/v1/engine/preferences", nil)
		w := httptest.NewRecorder()
		s.preferences(context.Background(), w, r, &auth.Identity{UserID: "verified-owner", Plan: plan})
		if plan != "premium_plus" && w.Code != 403 {
			t.Fatal("Plus access bypass", plan, w.Code)
		}
		if plan == "premium_plus" && w.Code != 200 {
			t.Fatal(w.Code)
		}
	}
	if store.calls != 1 || store.user != "verified-owner" {
		t.Fatal("unverified preferences accessed", store.calls, store.user)
	}
}
func TestInterestsUseVerifiedOwnerNotSubmittedIdentityAndValidateBeforeWrite(t *testing.T) {
	s, _ := fixtureServer()
	store := new(preferencesFixture)
	s.PreferencesStore = store
	s.Engine = &calculationFixture{}
	id := &auth.Identity{UserID: "verified-owner", Plan: "premium_plus"}
	for _, body := range []string{`{"symbol":""}`, `{"symbol":"KCB","exchange":"FAKE"}`, `{"symbol":"KCB","reset":null}`, `null`} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/api/v1/engine/interests", strings.NewReader(body))
		s.preferences(context.Background(), w, r, id)
		if w.Code != 400 {
			t.Fatal(body, w.Code)
		}
	}
	if store.calls != 0 {
		t.Fatal("invalid interest persisted")
	}
	r := httptest.NewRequest("POST", "/api/v1/engine/interests", strings.NewReader(`{"symbol":" kcb ","reset":true,"userId":"forged"}`))
	w := httptest.NewRecorder()
	s.preferences(context.Background(), w, r, id)
	if w.Code != 200 || store.user != "verified-owner" || store.symbol != "KCB" || !store.reset {
		t.Fatal("interest ownership/reset failed", store)
	}
}
