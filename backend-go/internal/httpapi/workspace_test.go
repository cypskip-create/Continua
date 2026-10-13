package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

type workspaceFixture struct {
	MarketStore
	calls    int
	owner    string
	rule     marketdata.MonitorRule
	capacity bool
}

func (f *workspaceFixture) MonitoringRules(_ context.Context, o string) ([]json.RawMessage, error) {
	f.calls++
	f.owner = o
	return []json.RawMessage{}, nil
}
func (f *workspaceFixture) MonitoringActivity(c context.Context, o string) ([]json.RawMessage, error) {
	return f.MonitoringRules(c, o)
}
func (f *workspaceFixture) SaveMonitoringRule(_ context.Context, o string, r marketdata.MonitorRule) (json.RawMessage, error) {
	f.calls++
	f.owner = o
	f.rule = r
	if f.capacity {
		return nil, marketdata.ErrMonitorCapacity
	}
	return json.RawMessage(`{}`), nil
}
func (f *workspaceFixture) DeleteMonitoringRule(_ context.Context, o, id string) error {
	f.calls++
	f.owner = o
	return nil
}
func (f *workspaceFixture) AddCashFlow(_ context.Context, o, e, d string, a float64, n string) (json.RawMessage, error) {
	f.calls++
	f.owner = o
	return json.RawMessage(`{"id":"fixture"}`), nil
}
func (f *workspaceFixture) DeleteCashFlow(c context.Context, o, id string) error {
	return f.DeleteMonitoringRule(c, o, id)
}

func TestWorkspaceValidatesBeforeWritesAndUsesVerifiedOwner(t *testing.T) {
	s, _ := fixtureServer()
	store := &workspaceFixture{MarketStore: s.Store}
	s.Store = store
	id := &auth.Identity{UserID: "verified-owner", Plan: "premium_plus"}
	for _, body := range []string{`null`, `{"symbol":"KCB","kind":"price_above"}`, `{"symbol":"KCB","kind":"unknown","threshold":1}`, `{"symbol":"KCB","kind":"material_change","enabled":null}`, `{"symbol":"KCB","kind":"material_change","threshold":null}`, `{"symbol":"KCB","kind":"price_above","threshold":1e10}`} {
		w := httptest.NewRecorder()
		s.workspace(context.Background(), w, httptest.NewRequest("POST", "/api/v1/engine/monitoring", strings.NewReader(body)), id)
		if w.Code != 400 {
			t.Fatal(body, w.Code)
		}
	}
	if store.calls != 0 {
		t.Fatal("invalid write")
	}
	w := httptest.NewRecorder()
	s.workspace(context.Background(), w, httptest.NewRequest("POST", "/api/v1/engine/monitoring", strings.NewReader(`{"symbol":" kcb ","kind":"material_change","user_id":"forged"}`)), id)
	if w.Code != 200 || store.owner != "verified-owner" || store.rule.Symbol != "KCB" || !store.rule.Enabled {
		t.Fatal(w.Code, store)
	}
	store.capacity = true
	w = httptest.NewRecorder()
	s.workspace(context.Background(), w, httptest.NewRequest("POST", "/api/v1/engine/monitoring", strings.NewReader(`{"symbol":"KCB","kind":"material_change"}`)), id)
	if w.Code != 400 {
		t.Fatal("rule cap ignored")
	}
}

func TestCashFlowsStrictDatesAmountsNotesAndPlus(t *testing.T) {
	s, _ := fixtureServer()
	store := &workspaceFixture{MarketStore: s.Store}
	s.Store = store
	id := &auth.Identity{UserID: "verified-owner", Plan: "premium_plus"}
	for _, body := range []string{`{"date":"2026-02-30","amount":1}`, `{"date":"2099-01-01","amount":1}`, `{"date":"2026-01-01","amount":0}`, `{"date":"2026-01-01","amount":"1"}`, `{"date":"2026-01-01","amount":null}`, `{"date":"2026-01-01","amount":1e13}`, `{"date":"2026-01-01","amount":1,"note":"` + strings.Repeat("💜", 81) + `"}`} {
		w := httptest.NewRecorder()
		s.workspace(context.Background(), w, httptest.NewRequest("POST", "/api/v1/engine/cash-flows", strings.NewReader(body)), id)
		if w.Code != 400 {
			t.Fatal(body, w.Code)
		}
	}
	if store.calls != 0 {
		t.Fatal("invalid cash flow stored")
	}
	for _, plan := range []string{"free", "premium", "premium_plus"} {
		w := httptest.NewRecorder()
		s.workspace(context.Background(), w, httptest.NewRequest("POST", "/api/v1/engine/cash-flows", strings.NewReader(`{"date":"2026-01-01","amount":-25,"user_id":"forged"}`)), &auth.Identity{UserID: "verified-owner", Plan: plan})
		expected := 403
		if plan == "premium_plus" {
			expected = 200
		}
		if w.Code != expected {
			t.Fatal(plan, w.Code)
		}
	}
	if store.calls != 1 || store.owner != "verified-owner" {
		t.Fatal(store)
	}
	for _, path := range []string{"/api/v1/engine/cash-flows/not-uuid", "/api/v1/engine/monitoring/00000000-0000-0000-0000-000000000000/extra"} {
		w := httptest.NewRecorder()
		s.workspace(context.Background(), w, httptest.NewRequest("DELETE", path, nil), id)
		if w.Code != 400 {
			t.Fatal(path, w.Code)
		}
	}
}
