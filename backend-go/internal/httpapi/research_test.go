package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/engine"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

type bundleFixture struct {
	calls  int
	symbol string
	err    error
}

func (f *bundleFixture) Bundle(_ context.Context, symbol, _ string) (json.RawMessage, error) {
	f.calls++
	f.symbol = symbol
	return json.RawMessage(`{"symbol":"KCB","companyName":"KCB Group PLC","currency":"KES","quote":null,"generatedAt":"2026-10-13T12:00:00.000Z","briefing":{},"coverage":{},"unavailable":[],"estimates":[{"fiscalYear":2025,"epsEstimate":null,"internal":"not-in-basic"}],"internal":"full-research"}`), f.err
}

func TestCompanyResearchRequiresSubscriberBeforeAssembly(t *testing.T) {
	s, _ := fixtureServer()
	f := &bundleFixture{}
	s.EngineBundles = f
	for _, id := range []*auth.Identity{nil, {UserID: "fixture", Plan: "free"}} {
		r := httptest.NewRequest("GET", "/api/v1/engine/KCB", nil)
		w := httptest.NewRecorder()
		if !s.companyResearch(context.Background(), w, r, id, "NSE") || w.Code == 200 {
			t.Fatal(w.Code)
		}
	}
	if f.calls != 0 {
		t.Fatal("unentitled request assembled research")
	}
}
func TestBasicResearchRedactsAdditionalFieldsButKeepsUnknownEstimates(t *testing.T) {
	s, _ := fixtureServer()
	f := &bundleFixture{}
	s.EngineBundles = f
	r := httptest.NewRequest("GET", "/api/v1/engine/basic/kcb", nil)
	w := httptest.NewRecorder()
	s.companyResearch(context.Background(), w, r, &auth.Identity{UserID: "fixture", Plan: "premium"}, "NSE")
	if w.Code != 200 || f.symbol != "KCB" || strings.Contains(w.Body.String(), "internal") || !strings.Contains(w.Body.String(), `"epsEstimate":null`) {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestUnknownAndInvalidResearchSymbolsFailWithoutFalseCoverage(t *testing.T) {
	s, _ := fixtureServer()
	f := &bundleFixture{err: engine.ErrUnknownCompany}
	s.EngineBundles = f
	id := &auth.Identity{UserID: "fixture", Plan: "premium_plus"}
	r := httptest.NewRequest("GET", "/api/v1/engine/KCB", nil)
	w := httptest.NewRecorder()
	s.companyResearch(context.Background(), w, r, id, "NSE")
	if w.Code != 404 {
		t.Fatal(w.Code)
	}
	r = httptest.NewRequest("GET", "/api/v1/engine/bad!", nil)
	w = httptest.NewRecorder()
	s.companyResearch(context.Background(), w, r, id, "NSE")
	if w.Code != 400 || f.calls != 1 {
		t.Fatal(w.Code, f.calls)
	}
}
