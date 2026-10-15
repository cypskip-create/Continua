package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"
)

type valuationFixture struct {
	calls int
	ratio string
	years int
	raw   json.RawMessage
	err   error
}

func (f *valuationFixture) Valuation(context.Context, string, string) (json.RawMessage, error) {
	f.calls++
	return f.raw, f.err
}
func (f *valuationFixture) ValuationHistory(_ context.Context, _, _, ratio string, years int) (json.RawMessage, error) {
	f.calls++
	f.ratio = ratio
	f.years = years
	return f.raw, f.err
}

func TestValuationHistoryRejectsInvalidQueriesBeforeCalculation(t *testing.T) {
	s, _ := fixtureServer()
	f := &valuationFixture{raw: json.RawMessage(`{}`)}
	s.Valuations = f
	for _, query := range []string{"ratio=ttm", "ratio=pe&ratio=ps", "years=0", "years=11", "years=1.2", "years=1&years=2"} {
		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/api/v1/valuation/KCB/history?"+query, nil)
		s.valuationReads(context.Background(), w, r, "NSE")
		if w.Code != 400 {
			t.Fatal(query, w.Code)
		}
	}
	if f.calls != 0 {
		t.Fatal("invalid query reached valuation provider")
	}
}
func TestValuationMissingAndFailedEvidenceNeverBecomesSuccess(t *testing.T) {
	s, _ := fixtureServer()
	for _, c := range []struct {
		raw    string
		err    error
		status int
	}{{"null", nil, 404}, {"{", nil, 503}, {"{}", errors.New("private fixture error"), 503}, {`{"current":null,"series":[]}`, nil, 200}} {
		s.Valuations = &valuationFixture{raw: json.RawMessage(c.raw), err: c.err}
		w := httptest.NewRecorder()
		r := httptest.NewRequest("GET", "/api/v1/valuation/KCB/history?ratio=pb&years=3", nil)
		s.valuationReads(context.Background(), w, r, "NSE")
		if w.Code != c.status {
			t.Fatal(w.Code, w.Body.String())
		}
	}
}
