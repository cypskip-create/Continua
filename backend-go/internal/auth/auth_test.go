package auth

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"testing"
	"time"
)

type keyStore struct {
	mu       sync.Mutex
	calls    int
	record   *APIKey
	failure  error
	lastHash string
}

func (s *keyStore) FindActiveKey(_ context.Context, hash string) (*APIKey, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls++
	s.lastHash = hash
	if s.record != nil {
		copy := *s.record
		return &copy, s.failure
	}
	return nil, s.failure
}
func (s *keyStore) TouchKey(context.Context, string) error { return nil }
func TestMissingAndRevokedFailClosed(t *testing.T) {
	s := &keyStore{}
	a := New(s, true)
	if _, err := a.Authenticate(context.Background(), http.Header{}); !errors.Is(err, ErrMissing) {
		t.Fatal(err)
	}
	h := http.Header{"X-Api-Key": []string{"fixture"}}
	if _, err := a.Authenticate(context.Background(), h); !errors.Is(err, ErrInvalid) {
		t.Fatal(err)
	}
}
func TestHashMatchesStoredNodeContract(t *testing.T) {
	got, err := HashKey("fixture-api-key")
	if err != nil {
		t.Fatal(err)
	}
	if got != "ead667b7765b4c5fb20db3f59fb34e3d751cfc0cd49f8ca6355361bdafbfca50" {
		t.Fatal("invalid scrypt output")
	}
}
func TestRevocationIsBoundedAndCacheContainsOnlyFingerprints(t *testing.T) {
	s := &keyStore{record: &APIKey{ID: "id", Active: true, RateLimitPerMin: 120}}
	a := New(s, true)
	now := time.Now()
	a.now = func() time.Time { return now }
	h := http.Header{"X-Api-Key": []string{"private-fixture-key"}}
	if _, err := a.Authenticate(context.Background(), h); err != nil {
		t.Fatal(err)
	}
	s.record = nil
	if _, err := a.Authenticate(context.Background(), h); err != nil {
		t.Fatal(err)
	}
	for k := range a.cache {
		if len(k) != 64 || k == "private-fixture-key" {
			t.Fatal("credential cached")
		}
	}
	now = now.Add(31 * time.Second)
	if _, err := a.Authenticate(context.Background(), h); !errors.Is(err, ErrInvalid) {
		t.Fatal("revocation not observed", err)
	}
}
func TestDatabaseFailureNeverBecomesAnonymousAccess(t *testing.T) {
	s := &keyStore{failure: errors.New("fixture outage")}
	a := New(s, true)
	if _, err := a.Authenticate(context.Background(), http.Header{"X-Api-Key": []string{"fixture"}}); err == nil {
		t.Fatal("database outage granted access")
	}
	if len(a.cache) != 0 {
		t.Fatal("outage cached as identity")
	}
}
func TestDevelopmentBypassCannotWorkInProduction(t *testing.T) {
	a := New(&keyStore{}, true)
	a.DevelopmentKey = "fixture"
	a.Enabled = false
	if _, err := a.Authenticate(context.Background(), http.Header{"X-Api-Key": []string{"fixture"}}); !errors.Is(err, ErrInvalid) {
		t.Fatal("production bypass", err)
	}
}
func TestHeaderPrecedence(t *testing.T) {
	h := http.Header{"Authorization": []string{"Bearer bearer-fixture"}, "X-Api-Key": []string{"header-fixture"}}
	if ExtractKey(h) != "bearer-fixture" {
		t.Fatal("changed header precedence")
	}
}
