package httpapi

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

type actionFixture struct {
	*fixtureStore
	known  bool
	called string
	limit  int
}

func (f *actionFixture) SecurityID(context.Context, string, string) (*string, error) {
	if !f.known {
		return nil, nil
	}
	id := "NSE:COOP"
	return &id, nil
}
func (f *actionFixture) CorporateActions(context.Context, string) ([]json.RawMessage, error) {
	f.called = "actions"
	return nil, nil
}
func (f *actionFixture) Dividends(context.Context, string) ([]json.RawMessage, error) {
	f.called = "dividends"
	return nil, nil
}
func (f *actionFixture) UpcomingDividends(_ context.Context, _ string, limit int) ([]json.RawMessage, error) {
	f.called = "upcoming"
	f.limit = limit
	return nil, nil
}
func (f *actionFixture) RecentEarnings(_ context.Context, _ string, limit int) ([]json.RawMessage, error) {
	f.called = "recent"
	f.limit = limit
	return nil, nil
}
func (f *actionFixture) Earnings(_ context.Context, _ string, limit int) ([]json.RawMessage, error) {
	f.called = "earnings"
	f.limit = limit
	return []json.RawMessage{json.RawMessage(`{"epsActual":null}`)}, nil
}
func (f *actionFixture) Ownership(context.Context, string) ([]json.RawMessage, error) {
	f.called = "ownership"
	return nil, nil
}

func TestActionRoutesKeepLiteralCalendarPathsAndNulls(t *testing.T) {
	s, store := fixtureServer()
	f := &actionFixture{fixtureStore: store, known: true}
	s.Store = f
	for _, path := range []string{"/dividends/upcoming", "/earnings/recent", "/corporate-actions/coop", "/dividends/coop", "/earnings/coop", "/ownership/coop"} {
		r := httptest.NewRequest("GET", "/api/v1"+path, nil)
		r.Header.Set("X-API-Key", "fixture-dev")
		w := httptest.NewRecorder()
		s.ServeHTTP(w, r)
		if w.Code != 200 {
			t.Fatal(path, w.Code, w.Body.String())
		}
		if path == "/dividends/upcoming" && f.called != "upcoming" {
			t.Fatal("literal calendar path treated as symbol")
		}
		if path == "/earnings/coop" && !strings.Contains(w.Body.String(), `"epsActual":null`) {
			t.Fatal("missing reviewed earnings replaced")
		}
	}
}
func TestActionQueriesRejectInvalidLimitsAndUnknownSymbols(t *testing.T) {
	s, store := fixtureServer()
	f := &actionFixture{fixtureStore: store}
	s.Store = f
	for _, path := range []string{"/dividends/upcoming?limit=0", "/dividends/upcoming?limit=101", "/earnings/recent?limit=2&limit=3"} {
		r := httptest.NewRequest("GET", "/api/v1"+path, nil)
		r.Header.Set("X-API-Key", "fixture-dev")
		w := httptest.NewRecorder()
		s.ServeHTTP(w, r)
		if w.Code != 400 {
			t.Fatal(path, w.Code)
		}
	}
	if f.called != "" {
		t.Fatal("invalid request reached database")
	}
	r := httptest.NewRequest("GET", "/api/v1/ownership/unknown", nil)
	r.Header.Set("X-API-Key", "fixture-dev")
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 404 {
		t.Fatal(w.Code)
	}
}
