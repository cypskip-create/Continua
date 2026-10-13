package cache

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestLRUExpiryByteBudgetAndImmutableValues(t *testing.T) {
	c := NewMemory()
	now := time.Now()
	c.Now = func() time.Time { return now }
	c.maxBytes = 30
	c.maxEntries = 2
	raw := json.RawMessage(`{"a":1}`)
	c.Set("a", raw, time.Minute)
	raw[2] = 'x'
	got := c.Get("a")
	if string(got) != `{"a":1}` {
		t.Fatal("caller mutated cache")
	}
	got[2] = 'y'
	if string(c.Get("a")) != `{"a":1}` {
		t.Fatal("read mutated cache")
	}
	c.Set("b", json.RawMessage(`1`), time.Minute)
	_ = c.Get("a")
	c.Set("c", json.RawMessage(`2`), time.Minute)
	if c.Get("b") != nil {
		t.Fatal("LRU not evicted")
	}
	c.Set("huge", json.RawMessage(`"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz"`), time.Minute)
	if c.bytes > c.maxBytes {
		t.Fatal("byte budget exceeded")
	}
	now = now.Add(time.Minute)
	if c.Get("a") != nil {
		t.Fatal("expired value returned")
	}
}
func TestCoalescedLoadsAndErrorsAreNotCached(t *testing.T) {
	c := NewMemory()
	start := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int32
	loader := func(context.Context) (json.RawMessage, error) {
		if calls.Add(1) == 1 {
			close(start)
		}
		<-release
		return json.RawMessage(`[]`), nil
	}
	var wg sync.WaitGroup
	for range 20 {
		wg.Go(func() {
			value, e := c.GetOrLoad(context.Background(), "key", time.Minute, loader)
			if e != nil || string(value) != `[]` {
				t.Error(value, e)
			}
		})
	}
	<-start
	close(release)
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatal("duplicate load", calls.Load())
	}
	fail := func(context.Context) (json.RawMessage, error) { calls.Add(1); return nil, errors.New("fixture") }
	for range 2 {
		if _, e := c.GetOrLoad(context.Background(), "failed", time.Minute, fail); e == nil {
			t.Fatal("failed load cached")
		}
	}
	if calls.Load() != 3 {
		t.Fatal(calls.Load())
	}
}
func TestCanceledFollowerDoesNotCancelLeaderAndPendingIsBounded(t *testing.T) {
	c := NewMemory()
	c.maxPending = 1
	started := make(chan struct{})
	release := make(chan struct{})
	done := make(chan struct{})
	go func() {
		defer close(done)
		_, _ = c.GetOrLoad(context.Background(), "leader", time.Minute, func(context.Context) (json.RawMessage, error) {
			close(started)
			<-release
			return json.RawMessage(`1`), nil
		})
	}()
	<-started
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e := c.GetOrLoad(ctx, "leader", time.Minute, nil); e != context.Canceled {
		t.Fatal("follower not canceled", e)
	}
	if _, e := c.GetOrLoad(context.Background(), "other", time.Minute, nil); e != ErrBusy {
		t.Fatal("unbounded pending", e)
	}
	close(release)
	<-done
	if string(c.Get("leader")) != `1` {
		t.Fatal("leader canceled by follower")
	}
}
