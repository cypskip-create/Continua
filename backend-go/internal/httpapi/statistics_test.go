package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
)

type statisticsFixture struct {
	calls int
	raw   json.RawMessage
	err   error
}

func (f *statisticsFixture) Statistics(context.Context, string, string) (json.RawMessage, error) {
	f.calls++
	return f.raw, f.err
}

func TestStatisticsValidationCacheAndUnavailable(t *testing.T) {
	s, _ := fixtureServer()
	f := &statisticsFixture{raw: json.RawMessage(`{"marketCap":null}`)}
	s.Statistics = f
	for _, symbol := range []string{"KCB/extra", "BAD!", strings.Repeat("A", 21)} {
		w := httptest.NewRecorder()
		s.statisticsReads(context.Background(), w, httptest.NewRequest("GET", "/api/v1/statistics/"+symbol, nil), "NSE")
		if w.Code != 400 {
			t.Fatal(w.Code)
		}
	}
	if f.calls != 0 {
		t.Fatal("invalid symbol reached provider")
	}
	for i := 0; i < 2; i++ {
		w := httptest.NewRecorder()
		s.statisticsReads(context.Background(), w, httptest.NewRequest("GET", "/api/v1/statistics/KCB", nil), "NSE")
		if w.Code != 200 {
			t.Fatal(w.Code)
		}
	}
	if f.calls != 1 {
		t.Fatal("statistics did not use cache", f.calls)
	}
	s.ReadCache = nil
	for _, c := range []struct {
		raw    string
		err    error
		status int
	}{{"null", nil, 404}, {"{", nil, 503}, {"{}", errors.New("private database credential"), 503}} {
		s.Statistics = &statisticsFixture{raw: json.RawMessage(c.raw), err: c.err}
		w := httptest.NewRecorder()
		s.statisticsReads(context.Background(), w, httptest.NewRequest("GET", "/api/v1/statistics/KCB", nil), "NSE")
		if w.Code != c.status || strings.Contains(w.Body.String(), "credential") {
			t.Fatal(w.Code, w.Body.String())
		}
	}
}
