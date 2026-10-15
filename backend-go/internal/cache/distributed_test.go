package cache

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"
)

type remoteFixture struct {
	mu          sync.Mutex
	values      map[string]json.RawMessage
	epochs      map[string]uint64
	unavailable bool
	calls       int
}

func newRemoteFixture() *remoteFixture {
	return &remoteFixture{values: map[string]json.RawMessage{}, epochs: map[string]uint64{}}
}
func (r *remoteFixture) Get(_ context.Context, key string) (json.RawMessage, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls++
	if r.unavailable {
		return nil, errors.New("fixture outage")
	}
	return clone(r.values[key]), nil
}
func (r *remoteFixture) Set(_ context.Context, key string, value json.RawMessage, _ time.Duration) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls++
	if r.unavailable {
		return errors.New("fixture outage")
	}
	r.values[key] = clone(value)
	return nil
}
func (r *remoteFixture) Epoch(_ context.Context, group string) (string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls++
	if r.unavailable {
		return "", errors.New("fixture outage")
	}
	return fmt.Sprint(r.epochs[group]), nil
}
func (r *remoteFixture) Bump(_ context.Context, group string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls++
	if r.unavailable {
		return errors.New("fixture outage")
	}
	r.epochs[group]++
	return nil
}
func (r *remoteFixture) Close() error { return nil }
func TestDistributedInvalidationCannotRepopulateLateOldEvidence(t *testing.T) {
	remote := newRemoteFixture()
	client := NewDistributed(remote)
	defer client.Close()
	entered, release, done := make(chan struct{}), make(chan struct{}), make(chan struct{})
	go func() {
		defer close(done)
		_, _ = client.GetOrLoad(context.Background(), "ratios:NSE:KCB", time.Minute, func(context.Context) (json.RawMessage, error) {
			close(entered)
			<-release
			return json.RawMessage(`{"pe":7}`), nil
		})
	}()
	<-entered
	client.Delete("ratios:NSE:KCB")
	close(release)
	<-done
	if raw := client.Get("ratios:NSE:KCB"); raw != nil {
		t.Fatal("late stale remote result survived invalidation", string(raw))
	}
	remote.mu.Lock()
	remote.unavailable = true
	remote.mu.Unlock()
	if raw := client.Get("ratios:NSE:KCB"); raw != nil {
		t.Fatal("late stale result reappeared in outage fallback", string(raw))
	}
}
func TestDistributedCurrentInvalidationRetainsSeparatelyDatedLastGood(t *testing.T) {
	remote := newRemoteFixture()
	client := NewDistributed(remote)
	defer client.Close()
	good := json.RawMessage(`{"generatedAt":"2026-10-14T09:00:00Z"}`)
	client.Set("engine:last-good:v2:NSE:KCB", good, 24*time.Hour)
	client.Set("engine:v5:NSE:KCB", good, time.Minute)
	client.Delete("engine:v5:NSE:KCB")
	if raw := client.Get("engine:v5:NSE:KCB"); raw != nil {
		t.Fatal("current bundle not invalidated")
	}
	if raw := client.Get("engine:last-good:v2:NSE:KCB"); string(raw) != string(good) {
		t.Fatal("last-good evidence erased", string(raw))
	}
}
func TestPrivateKeysNeverReachRemoteCache(t *testing.T) {
	remote := newRemoteFixture()
	client := NewDistributed(remote)
	defer client.Close()
	for _, key := range []string{"billing:owner", "auth:token", "subscription:owner", "preferences:owner"} {
		client.Set(key, json.RawMessage(`"private-fixture"`), time.Minute)
		_ = client.Get(key)
	}
	remote.mu.Lock()
	defer remote.mu.Unlock()
	if remote.calls != 0 || len(remote.values) != 0 {
		t.Fatal("private cache data reached remote")
	}
}
