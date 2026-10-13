package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

const fixtureUserID = "12345678-1234-4123-8123-123456789012"

type planStore struct {
	calls    int
	id, plan string
	err      error
}

func (s *planStore) EffectivePlan(_ context.Context, id string) (string, error) {
	s.calls++
	s.id = id
	return s.plan, s.err
}
func TestUserIdentityComesFromAuthServiceNotClientFlags(t *testing.T) {
	store := &planStore{plan: "premium"}
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/user" || r.Header.Get("Authorization") != "Bearer fixture-token" || r.Header.Get("apikey") != "fixture-public" {
			t.Error("auth contract changed")
		}
		w.Write([]byte(`{"id":"` + fixtureUserID + `","email":"fixture@example.test"}`))
	}))
	defer provider.Close()
	headers := http.Header{"X-User-Token": []string{"fixture-token"}, "X-Supabase-Key": []string{"fixture-public"}, "X-User-Id": []string{"forged"}, "X-Subscription-Plan": []string{"premium_plus"}}
	identity, err := NewUserVerifier(provider.URL, store).Verify(context.Background(), headers)
	if err != nil || identity.UserID != fixtureUserID || identity.Plan != "premium" || store.id != fixtureUserID {
		t.Fatal(identity, err)
	}
	if RequirePlus(identity) == nil || RequirePremium(identity) != nil {
		t.Fatal("entitlement widened")
	}
}
func TestUnverifiedUsersNeverReachPlanLookup(t *testing.T) {
	for _, status := range []int{401, 403, 500, 302} {
		store := &planStore{}
		provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(status) }))
		headers := http.Header{"X-User-Token": []string{"fixture-token"}, "X-Supabase-Key": []string{"fixture-public"}}
		identity, err := NewUserVerifier(provider.URL, store).Verify(context.Background(), headers)
		provider.Close()
		if err == nil || identity != nil || store.calls != 0 {
			t.Fatal("invalid session trusted", status)
		}
	}
}
func TestMissingInvalidOrUnverifiableProfileFailsClosed(t *testing.T) {
	store := &planStore{}
	v := NewUserVerifier("http://127.0.0.1:1", store)
	if _, err := v.Verify(context.Background(), http.Header{}); AccessStatus(err) != 401 {
		t.Fatal(err)
	}
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`{"id":"` + fixtureUserID + `"}`)) }))
	defer provider.Close()
	store.err = errors.New("fixture DB unavailable")
	v = NewUserVerifier(provider.URL, store)
	headers := http.Header{"X-User-Token": []string{"fixture-token"}, "X-Supabase-Key": []string{"fixture-public"}}
	if identity, err := v.Verify(context.Background(), headers); identity != nil || AccessStatus(err) != 503 {
		t.Fatal(identity, err)
	}
}
func TestPremiumBoundaries(t *testing.T) {
	if RequirePremium(&Identity{Plan: "free"}) == nil || RequirePlus(&Identity{Plan: "premium"}) == nil || RequirePlus(&Identity{Plan: "premium_plus"}) != nil {
		t.Fatal("plan boundary changed")
	}
	if RequirePremium(nil) == nil {
		t.Fatal("anonymous access")
	}
}
