package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/engine"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

type technicalFixture struct {
	*historyFixture
	screenFilters marketdata.Screen
}

func (f *technicalFixture) CorporateActions(context.Context, string) ([]json.RawMessage, error) {
	return []json.RawMessage{}, nil
}
func (f *technicalFixture) Screen(_ context.Context, s marketdata.Screen) ([]json.RawMessage, error) {
	f.calls++
	f.screenFilters = s
	return nil, nil
}

type technicalCalculator struct {
	calls     int
	operation string
	output    json.RawMessage
}

func (f *technicalCalculator) Calculate(_ context.Context, r engine.Request) (json.RawMessage, error) {
	f.calls++
	f.operation = r.Operation
	return f.output, nil
}
func TestScreeningValidatesAndPreservesMissingResults(t *testing.T) {
	s, base := fixtureServer()
	f := &technicalFixture{historyFixture: &historyFixture{fixtureStore: base}}
	s.Store = f
	for _, query := range []string{"limit=0", "maxPe=NaN", "minMarketCap=-1", "minAfriScore=101", "sortBy=sql", "sector=", "limit=1&limit=2"} {
		r := httptest.NewRequest("GET", "/api/v1/screener?"+query, nil)
		r.Header.Set("X-API-Key", "fixture-dev")
		w := httptest.NewRecorder()
		s.ServeHTTP(w, r)
		if w.Code != 400 {
			t.Fatal(query, w.Code)
		}
	}
	if f.calls != 0 {
		t.Fatal("invalid filters reached storage")
	}
	r := httptest.NewRequest("GET", "/api/v1/screener?sector=banking&maxPe=10&sortDirection=asc", nil)
	r.Header.Set("X-API-Key", "fixture-dev")
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 200 || f.screenFilters.Sector != "banking" || f.screenFilters.Numbers["maxPe"] != 10 || !strings.Contains(w.Body.String(), `"data":[]`) {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestHistoricalResearchIsPremiumOnlyAndNeverInventsVolume(t *testing.T) {
	s, base := fixtureServer()
	f := &technicalFixture{historyFixture: &historyFixture{fixtureStore: base}}
	s.Store = f
	calc := &technicalCalculator{output: json.RawMessage(`null`)}
	s.Engine = calc
	r := httptest.NewRequest("GET", "/api/v1/volume-profile/KCB", nil)
	w := httptest.NewRecorder()
	s.technicalResearch(context.Background(), w, r, &auth.Identity{UserID: "fixture", Plan: "free"})
	if w.Code != 403 || f.calls != 0 || calc.calls != 0 {
		t.Fatal(w.Code)
	}
	w = httptest.NewRecorder()
	s.technicalResearch(context.Background(), w, r, &auth.Identity{UserID: "fixture", Plan: "premium"})
	if w.Code != 404 || calc.calls != 0 {
		t.Fatal(w.Code)
	}
	f.rows = []json.RawMessage{json.RawMessage(`{"close":30,"volume":null}`)}
	w = httptest.NewRecorder()
	s.technicalResearch(context.Background(), w, r, &auth.Identity{UserID: "fixture", Plan: "premium"})
	if w.Code != 404 || calc.operation != "volume_profile" {
		t.Fatal(w.Code, calc.operation)
	}
	calc.output = json.RawMessage(`{"blocked":"Unverified corporate-action basis"}`)
	f.rows = []json.RawMessage{json.RawMessage(`{}`), json.RawMessage(`{}`), json.RawMessage(`{}`), json.RawMessage(`{}`), json.RawMessage(`{}`)}
	r = httptest.NewRequest("POST", "/api/v1/backtest", strings.NewReader(`{"symbol":"KCB","strategy":"sma_cross","from":"2024-01-01","to":"2024-12-31"}`))
	w = httptest.NewRecorder()
	s.technicalResearch(context.Background(), w, r, &auth.Identity{UserID: "fixture", Plan: "premium_plus"})
	if w.Code != 422 || calc.operation != "backtest" {
		t.Fatal(w.Code, calc.operation)
	}
}
