package engine

import (
	"context"
	"continua/backend/internal/cache"
	"encoding/json"
	"sync"
	"testing"
	"time"
)

type bundleInputsFixture struct {
	entered            chan struct{}
	release            chan struct{}
	once               sync.Once
	mu                 sync.Mutex
	calls, active, max int
}

func (f *bundleInputsFixture) Profile(ctx context.Context, _, _ string) (json.RawMessage, error) {
	f.mu.Lock()
	f.calls++
	f.mu.Unlock()
	f.once.Do(func() {
		if f.entered != nil {
			close(f.entered)
		}
	})
	if f.release != nil {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-f.release:
		}
	}
	return json.RawMessage(`{"id":"NSE:KCB","currency":"KES","company":{"name":"KCB Group PLC"}}`), nil
}
func (f *bundleInputsFixture) Section(ctx context.Context, name, _, _, _ string) (json.RawMessage, error) {
	f.mu.Lock()
	f.active++
	if f.active > f.max {
		f.max = f.active
	}
	f.mu.Unlock()
	defer func() { f.mu.Lock(); f.active--; f.mu.Unlock() }()
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(time.Millisecond):
	}
	if name == "quote" || name == "valuation" {
		return json.RawMessage(`null`), nil
	}
	return json.RawMessage(`[]`), nil
}
func (f *bundleInputsFixture) Article(context.Context, string) (json.RawMessage, error) {
	return json.RawMessage(`null`), nil
}

type bundleWorkerFixture struct{ missing []string }

func (f bundleWorkerFixture) Calculate(_ context.Context, r Request) (json.RawMessage, error) {
	input := r.Args[0].(map[string]any)
	now := r.Args[1].(string)
	missing := input["unavailable"]
	if f.missing != nil {
		missing = f.missing
	}
	return json.Marshal(map[string]any{"bundle": map[string]any{"generatedAt": now, "unavailable": missing, "changes": map[string]any{"baseline": true, "changes": []any{}}}, "state": map[string]any{}, "observeEligible": false})
}

func TestBundleCoalescesReadersAndBoundsConcurrentSections(t *testing.T) {
	f := &bundleInputsFixture{entered: make(chan struct{}), release: make(chan struct{})}
	s := NewBundleService(f, bundleWorkerFixture{}, nil, nil)
	defer s.Close(context.Background())
	first := make(chan error, 1)
	second := make(chan error, 1)
	go func() { _, err := s.Bundle(context.Background(), "KCB", "NSE"); first <- err }()
	<-f.entered
	go func() { _, err := s.Bundle(context.Background(), "KCB", "NSE"); second <- err }()
	close(f.release)
	if err := <-first; err != nil {
		t.Fatal(err)
	}
	if err := <-second; err != nil {
		t.Fatal(err)
	}
	if f.calls != 1 || f.max > 2 {
		t.Fatalf("profiles=%d concurrent=%d", f.calls, f.max)
	}
}

func TestLastGoodTimestampRetainedWhenCriticalRefreshIsIncomplete(t *testing.T) {
	f := &bundleInputsFixture{}
	s := NewBundleService(f, bundleWorkerFixture{missing: []string{"Quote"}}, nil, nil)
	defer s.Close(context.Background())
	now := time.Date(2026, 10, 13, 12, 0, 0, 0, time.UTC)
	s.Now = func() time.Time { return now }
	s.Cache.(*cache.Memory).Now = s.Now
	old := json.RawMessage(`{"generatedAt":"2026-10-13T10:00:00.000Z","unavailable":[],"marker":"last-good"}`)
	s.Cache.Set(LastGoodKey("NSE", "KCB"), old, 24*time.Hour)
	raw, err := s.Bundle(context.Background(), "KCB", "NSE")
	if err != nil || string(raw) != string(old) {
		t.Fatal(string(raw), err)
	}
	s.mu.Lock()
	flight := s.pending["NSE:KCB"]
	s.mu.Unlock()
	if flight != nil {
		<-flight.done
	}
	var result struct {
		GeneratedAt string `json:"generatedAt"`
		Refresh     struct {
			State string `json:"state"`
		} `json:"refresh"`
	}
	if json.Unmarshal(s.Cache.Get(LastGoodKey("NSE", "KCB")), &result) != nil || result.GeneratedAt != "2026-10-13T10:00:00.000Z" || result.Refresh.State != "retained" {
		t.Fatal(result)
	}
}

func TestPublicationInvalidationCancelsOldInputRefresh(t *testing.T) {
	f := &bundleInputsFixture{entered: make(chan struct{}), release: make(chan struct{})}
	s := NewBundleService(f, bundleWorkerFixture{}, nil, nil)
	defer s.Close(context.Background())
	done := make(chan error, 1)
	go func() { _, err := s.Bundle(context.Background(), "KCB", "NSE"); done <- err }()
	<-f.entered
	s.Invalidate("NSE", "KCB")
	if err := <-done; err == nil {
		t.Fatal("invalidated research returned as new")
	}
	if s.Cache.Get(BundleKey("NSE", "KCB")) != nil || s.Cache.Get(LastGoodKey("NSE", "KCB")) != nil {
		t.Fatal("old filing restored after invalidation")
	}
}
