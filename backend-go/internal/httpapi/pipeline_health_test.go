package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
)

type pipelineFixture struct {
	MarketStore
	calls int
	fail  bool
}

func (p *pipelineFixture) QuoteFreshness(context.Context) (int64, int64, error) {
	p.calls++
	return 3, 1, nil
}
func (p *pipelineFixture) ValidationOutcomes(context.Context) ([]json.RawMessage, error) {
	if p.fail {
		return nil, errors.New("private database credential detail")
	}
	return []json.RawMessage{json.RawMessage(`{"outcome":"review","count":2,"latest":null}`)}, nil
}
func TestPipelineHealthIsPlusOnlyBoundedCachedAndDoesNotExposeErrors(t *testing.T) {
	s, _ := fixtureServer()
	p := &pipelineFixture{MarketStore: s.Store}
	s.Store = p
	s.IgnoreCalendar = true
	run := func(plan string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		s.pipelineHealth(context.Background(), w, httptest.NewRequest("GET", "/api/v1/engine/pipeline-health", nil), &auth.Identity{UserID: "verified", Plan: plan})
		return w
	}
	if w := run("free"); w.Code != 403 || p.calls != 0 {
		t.Fatal("pipeline entitlement bypass")
	}
	for i := 0; i < 2; i++ {
		if w := run("premium_plus"); w.Code != 200 || strings.Contains(w.Body.String(), "private database") {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	if p.calls != 1 {
		t.Fatal("pipeline probe amplified", p.calls)
	}
	s.ReadCache.Delete("pipeline-health")
	p.fail = true
	if w := run("premium_plus"); w.Code != 503 || strings.Contains(w.Body.String(), "credential") {
		t.Fatal("private diagnostics leaked", w.Body.String())
	}
}
