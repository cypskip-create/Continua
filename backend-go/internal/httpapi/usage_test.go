package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
)

type usageFixture struct {
	MarketStore
	owner string
	calls int
}

func (u *usageFixture) AIUsage(_ context.Context, owner string) (json.RawMessage, error) {
	u.owner = owner
	u.calls++
	return json.RawMessage(`{"requests":0,"reserved":0}`), nil
}
func TestUsageIsOwnedPlusOnlyAndPaidProviderDisabled(t *testing.T) {
	s, _ := fixtureServer()
	u := &usageFixture{MarketStore: s.Store}
	s.Store = u
	for _, plan := range []string{"free", "premium_plus"} {
		w := httptest.NewRecorder()
		s.usage(context.Background(), w, httptest.NewRequest("GET", "/api/v1/engine/usage?userId=other", nil), &auth.Identity{UserID: "verified-owner", Plan: plan})
		if plan == "free" {
			if w.Code != 403 || u.calls != 0 {
				t.Fatal("usage bypass")
			}
		} else if w.Code != 200 || u.owner != "verified-owner" || !strings.Contains(w.Body.String(), `"configured":false`) {
			t.Fatal(w.Code, u.owner, w.Body.String())
		}
	}
	if s.ConfigureUsage(func(string) string { return "NaN" }) == nil {
		t.Fatal("nonfinite usage cap accepted")
	}
}
