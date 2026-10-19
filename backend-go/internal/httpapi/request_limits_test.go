package httpapi

import (
	"context"
	"continua/backend/internal/cache"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type failingCounter struct{ *cache.Memory }

func (f failingCounter) Take(context.Context, string, int, time.Duration) (bool, time.Duration, error) {
	return false, 0, errors.New("private dependency detail")
}
func TestDistributedProtectionFailureDoesNotFallBackToUnlimitedAccess(t *testing.T) {
	s := New(nil, nil)
	s.ReadCache = failingCounter{cache.NewMemory()}
	w := httptest.NewRecorder()
	if s.admit(context.Background(), w, "fixture-user", 10, time.Minute) || w.Code != 503 || !strings.Contains(w.Body.String(), "RATE_LIMIT_STORE_UNAVAILABLE") || strings.Contains(w.Body.String(), "private dependency") {
		t.Fatal(w.Code, w.Body.String())
	}
	if w.Header().Get("Retry-After") == "" {
		t.Fatal("retry information missing")
	}
}
func TestResourcePoliciesAndMachineReadable429(t *testing.T) {
	s := New(nil, nil)
	for index := 0; index < 2; index++ {
		w := httptest.NewRecorder()
		allowed := s.admit(context.Background(), w, "resource:fixture", 1, time.Minute)
		if allowed != (index == 0) {
			t.Fatal("resource policy bypass")
		}
		if index == 1 && (w.Code != 429 || !strings.Contains(w.Body.String(), "RATE_LIMITED")) {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	for _, fixture := range []struct {
		method, path, policy string
		limit                int
	}{
		{"GET", "/api/v1/engine/CGEN", "research", 30},
		{"HEAD", "/api/v1/engine/CGEN", "research", 30},
		{"GET", "/api/v1/statistics/KCB", "research", 30},
		{"GET", "/api/v1/research/COOP", "research", 30},
		{"GET", "/api/v1/valuation/CGEN", "research", 30},
		{"GET", "/api/v1/price-history/CGEN", "research", 30},
		{"GET", "/api/v1/exports", "", 0},
		{"OPTIONS", "/api/v1/quotes", "", 0},
		{"POST", "/api/v1/engine/portfolio", "calculation-write", 20},
		{"POST", "/api/v1/engine/notebook/export", "transfer", 5},
		{"POST", "/api/v1/billing/checkout", "billing", 20},
	} {
		policy, limit := workloadPolicy(httptest.NewRequest(fixture.method, fixture.path, nil))
		if policy != fixture.policy || limit != fixture.limit {
			t.Fatal(policy, limit)
		}
	}
}
