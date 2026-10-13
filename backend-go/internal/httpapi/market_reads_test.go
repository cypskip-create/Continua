package httpapi

import (
	"context"
	"continua/backend/internal/engine"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type historyFixture struct {
	*fixtureStore
	known          bool
	calls          int
	sourceInterval string
	rows, history  []json.RawMessage
	latest         json.RawMessage
	first, last    *float64
}

func (f *historyFixture) SecurityID(context.Context, string, string) (*string, error) {
	if !f.known {
		return nil, nil
	}
	id := "NSE:COOP"
	return &id, nil
}
func (f *historyFixture) Candles(_ context.Context, _, interval string, _, _ time.Time) ([]json.RawMessage, error) {
	f.calls++
	f.sourceInterval = interval
	return f.rows, nil
}
func (f *historyFixture) PriceAt(_ context.Context, _ string, at time.Time) (*float64, error) {
	if at.Year() == 2025 {
		return f.first, nil
	}
	return f.last, nil
}
func (f *historyFixture) Sparklines(context.Context, string, []string, int) (map[string][]float64, error) {
	return map[string][]float64{"COOP": {20, 21}}, nil
}
func (f *historyFixture) Indices(context.Context, string) ([]json.RawMessage, error) {
	f.calls++
	return []json.RawMessage{json.RawMessage(`{"code":"NASI","value":244.93,"timestamp":"2026-10-09T12:00:00.000Z"}`)}, nil
}
func (f *historyFixture) LatestFinancials(context.Context, string, string) (json.RawMessage, error) {
	f.calls++
	return f.latest, nil
}
func (f *historyFixture) FinancialHistory(context.Context, string, string, int) ([]json.RawMessage, error) {
	f.calls++
	return f.history, nil
}

type calculationFixture struct {
	operation string
	raw       json.RawMessage
}

func (f *calculationFixture) Calculate(_ context.Context, r engine.Request) (json.RawMessage, error) {
	f.operation = r.Operation
	return f.raw, nil
}
func historyServer() (*Server, *historyFixture) {
	s, f := fixtureServer()
	h := &historyFixture{fixtureStore: f, known: true}
	s.Store = h
	return s, h
}
func TestHistoricalEmptyAndValidationStates(t *testing.T) {
	s, h := historyServer()
	h.known = false
	if w := request(s, "/api/v1/historical/UNKNOWN", "fixture-dev"); w.Code != 200 || strings.TrimSpace(w.Body.String()) != `{"data":[]}` {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, path := range []string{"/api/v1/historical/COOP?interval=invalid", "/api/v1/historical/COOP?from=invalid", "/api/v1/historical/sparklines?symbols=COOP&points=91", "/api/v1/historical/COOP/performance", "/api/v1/historical/sparklines?symbols=COOP&points=20&points=30"} {
		if w := request(s, path, "fixture-dev"); w.Code != 400 {
			t.Fatal(path, w.Code)
		}
	}
	if h.calls != 0 {
		t.Fatal("invalid input reached history")
	}
}
func TestCoarseCandlesUseDailyPythonAggregationAndRangeFilter(t *testing.T) {
	s, h := historyServer()
	calculator := &calculationFixture{raw: json.RawMessage(`[{"timestamp":"2026-01-01T00:00:00.000Z","close":20},{"timestamp":"2026-02-01T00:00:00.000Z","close":21}]`)}
	s.Engine = calculator
	path := "/api/v1/historical/COOP?interval=1M&from=2026-01-15&to=2026-03-01"
	for range 2 {
		w := request(s, path, "fixture-dev")
		if w.Code != 200 || strings.Contains(w.Body.String(), "2026-01-01") || !strings.Contains(w.Body.String(), "2026-02-01") {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	if calculator.operation != "aggregate_candles" || h.sourceInterval != "1d" || h.calls != 1 {
		t.Fatal("legacy coarse bars used/cache failed", h.sourceInterval, h.calls)
	}
}
func TestPerformanceMissingAndZeroDenominatorRemainUnavailable(t *testing.T) {
	s, h := historyServer()
	path := "/api/v1/historical/COOP/performance?from=2025-01-01&to=2026-01-01"
	if w := request(s, path, "fixture-dev"); w.Code != 404 {
		t.Fatal(w.Code)
	}
	zero, last := 0.0, 20.0
	h.first = &zero
	h.last = &last
	if w := request(s, path, "fixture-dev"); w.Code != 404 {
		t.Fatal("zero division", w.Code)
	}
	first := 10.0
	h.first = &first
	if w := request(s, path, "fixture-dev"); w.Code != 200 || !strings.Contains(w.Body.String(), `"changePercent":100`) {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestFinancialsKeepNullsAndMissingHistoryAndWakeCollection(t *testing.T) {
	s, h := historyServer()
	wakes := 0
	s.RequestDocuments = func() { wakes++ }
	if w := request(s, "/api/v1/financials/COOP", "fixture-dev"); w.Code != 404 || wakes != 1 {
		t.Fatal("missing filings did not wake collection", w.Code, wakes)
	}
	if w := request(s, "/api/v1/financials/COOP/history", "fixture-dev"); w.Code != 200 || strings.TrimSpace(w.Body.String()) != `{"data":[]}` {
		t.Fatal(w.Code, w.Body.String())
	}
	h.latest = json.RawMessage(`{"fiscalYear":2025,"eps":null,"periodEnd":"2025-12-31"}`)
	if w := request(s, "/api/v1/financials/COOP", "fixture-dev"); w.Code != 200 || !strings.Contains(w.Body.String(), `"eps":null`) {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestIndexRefreshIsRequestedOnCacheHitsAndDateIsNotRelabeled(t *testing.T) {
	s, h := historyServer()
	wakes := 0
	s.RequestIndices = func() { wakes++ }
	for range 2 {
		w := request(s, "/api/v1/indices", "fixture-dev")
		if w.Code != 200 || !strings.Contains(w.Body.String(), "2026-10-09") {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	if wakes != 2 || h.calls != 1 {
		t.Fatal(wakes, h.calls)
	}
}
func TestHistoryStillRequiresAPIKey(t *testing.T) {
	s, h := historyServer()
	r := httptest.NewRequest("GET", "/api/v1/historical/COOP", nil)
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 401 || h.calls != 0 {
		t.Fatal("history auth bypass")
	}
}
