package cache

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type Remote interface {
	Get(context.Context, string) (json.RawMessage, error)
	Set(context.Context, string, json.RawMessage, time.Duration) error
	Epoch(context.Context, string) (string, error)
	Bump(context.Context, string) error
	Close() error
}

var namespacePattern = regexp.MustCompile(`^[a-zA-Z0-9:_-]{1,80}$`)
var epochPattern = regexp.MustCompile(`^[0-9]{1,20}$`)

type Distributed struct {
	remote            Remote
	fallback, flights *Memory
	mu                sync.Mutex
	dirty             map[string]bool
	revisions         map[string]uint64
	wake              chan struct{}
	cancel            context.CancelFunc
	stopped           chan struct{}
	slots             chan struct{}
	Failures          atomic.Uint64
}

func NewDistributed(remote Remote) *Distributed {
	ctx, cancel := context.WithCancel(context.Background())
	d := &Distributed{remote: remote, fallback: NewMemory(), flights: NewMemory(), slots: make(chan struct{}, 2), dirty: map[string]bool{}, revisions: map[string]uint64{}, wake: make(chan struct{}, 1), cancel: cancel, stopped: make(chan struct{})}
	go d.invalidationLoop(ctx)
	return d
}
func remoteEligible(key string) bool {
	if len(key) > 4096 || strings.ContainsAny(key, "\x00\r\n") {
		return false
	}
	for _, prefix := range remoteGroups {
		if strings.HasPrefix(key, prefix+":") {
			return true
		}
	}
	return false
}

var remoteGroups = []string{"quote", "quotes", "candles", "candle-read", "price-read", "financial-read", "ratios", "afriscore", "sectors", "instruments", "indices", "profile", "publisher", "news", "market-research", "engine:v5", "engine:last-good:v2"}

func remoteGroup(key string) string {
	for _, group := range remoteGroups {
		if strings.HasPrefix(key, group+":") {
			return group
		}
	}
	return ""
}
func (d *Distributed) admitted(ctx context.Context) (context.Context, func(), error) {
	ctx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
	select {
	case d.slots <- struct{}{}:
		return ctx, func() { <-d.slots; cancel() }, nil
	case <-ctx.Done():
		cancel()
		return nil, nil, errors.New("remote cache deadline")
	}
}
func (d *Distributed) physical(ctx context.Context, key string) (string, error) {
	group := remoteGroup(key)
	for attempt := 0; attempt < 2; attempt++ {
		d.mu.Lock()
		revision, dirty := d.revisions[group], d.dirty[group]
		d.mu.Unlock()
		if dirty {
			if e := d.remote.Bump(ctx, group); e != nil {
				return "", e
			}
			d.mu.Lock()
			if d.revisions[group] == revision {
				d.dirty[group] = false
			}
			d.mu.Unlock()
		}
		epoch, e := d.remote.Epoch(ctx, group)
		if e != nil || !epochPattern.MatchString(epoch) {
			return "", errors.New("remote cache generation unavailable")
		}
		d.mu.Lock()
		unchanged := d.revisions[group] == revision
		d.mu.Unlock()
		if unchanged {
			return group + ":" + epoch + ":" + key, nil
		}
	}
	return "", ErrBusy
}
func (d *Distributed) Get(key string) json.RawMessage {
	if !remoteEligible(key) {
		return d.fallback.Get(key)
	}
	ctx, done, e := d.admitted(context.Background())
	if e != nil {
		d.Failures.Add(1)
		return d.fallback.Get(key)
	}
	defer done()
	physical, e := d.physical(ctx, key)
	if e == nil {
		var raw json.RawMessage
		raw, e = d.remote.Get(ctx, physical)
		if e == nil && raw != nil {
			return clone(raw)
		}
	}
	if e != nil {
		d.Failures.Add(1)
		return d.fallback.Get(key)
	}
	return nil
}
func (d *Distributed) Set(key string, value json.RawMessage, ttl time.Duration) {
	d.fallback.Set(key, value, ttl)
	if !remoteEligible(key) || len(value) > 4*1024*1024 || !json.Valid(value) || ttl <= 0 {
		return
	}
	ctx, done, e := d.admitted(context.Background())
	if e != nil {
		d.Failures.Add(1)
		return
	}
	defer done()
	physical, e := d.physical(ctx, key)
	if e == nil {
		e = d.remote.Set(ctx, physical, value, ttl)
	}
	if e != nil {
		d.Failures.Add(1)
	}
}
func (d *Distributed) Delete(key string) {
	if remoteEligible(key) {
		d.invalidate(remoteGroup(key))
	}
	d.fallback.Delete(key)
}
func (d *Distributed) DeletePrefix(prefix string) {
	for _, group := range remoteGroups {
		if prefix == "" || strings.HasPrefix(prefix, group+":") || strings.HasPrefix(group+":", prefix) {
			d.invalidate(group)
		}
	}
	d.fallback.DeletePrefix(prefix)
}
func (d *Distributed) invalidate(group string) {
	d.mu.Lock()
	d.dirty[group] = true
	d.revisions[group]++
	d.mu.Unlock()
	d.flights.DeletePrefix(group + ":")
	select {
	case d.wake <- struct{}{}:
	default:
	}
}
func (d *Distributed) invalidationLoop(ctx context.Context) {
	defer close(d.stopped)
	for {
		select {
		case <-ctx.Done():
			return
		case <-d.wake:
		}
		timer := time.NewTimer(50 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
		// One bounded controller coalesces a whole issuer batch; no goroutine/RPC per
		// tick. Failed invalidations remain dirty and retry synchronously before reads.
		for _, group := range remoteGroups {
			d.mu.Lock()
			dirty := d.dirty[group]
			d.mu.Unlock()
			if !dirty {
				continue
			}
			remoteCtx, done, e := d.admitted(ctx)
			if e == nil {
				_, e = d.physical(remoteCtx, group+":invalidate")
				done()
			}
			if e != nil {
				d.Failures.Add(1)
			}
		}
	}
}
func (d *Distributed) GetOrLoad(ctx context.Context, key string, ttl time.Duration, load func(context.Context) (json.RawMessage, error)) (json.RawMessage, error) {
	if !remoteEligible(key) {
		return d.fallback.GetOrLoad(ctx, key, ttl, load)
	}
	remoteCtx, done, e := d.admitted(ctx)
	if e != nil {
		d.Failures.Add(1)
		return d.fallback.GetOrLoad(ctx, key, ttl, load)
	}
	group := remoteGroup(key)
	d.mu.Lock()
	revision := d.revisions[group]
	d.mu.Unlock()
	physical, e := d.physical(remoteCtx, key)
	done()
	if e != nil {
		d.Failures.Add(1)
		return d.fallback.GetOrLoad(ctx, key, ttl, load)
	}
	// Epoch is captured before loading. A late old computation can only write the
	// old generation, never repopulate the newly invalidated distributed cache.
	return d.flights.GetOrLoad(ctx, physical, 0, func(ctx context.Context) (json.RawMessage, error) {
		remoteCtx, done, e := d.admitted(ctx)
		var raw json.RawMessage
		if e == nil {
			raw, e = d.remote.Get(remoteCtx, physical)
			done()
		}
		if e == nil && raw != nil {
			d.mu.Lock()
			if d.revisions[group] == revision {
				d.fallback.Set(key, raw, ttl)
			}
			d.mu.Unlock()
			return raw, nil
		}
		if e != nil {
			d.Failures.Add(1)
			return d.fallback.GetOrLoad(ctx, key, ttl, load)
		}
		value, e := load(ctx)
		if e != nil {
			return nil, e
		}
		d.mu.Lock()
		if d.revisions[group] == revision {
			d.fallback.Set(key, value, ttl)
		}
		d.mu.Unlock()
		if len(value) <= 4*1024*1024 && json.Valid(value) && ttl > 0 {
			remoteCtx, done, e := d.admitted(ctx)
			if e == nil {
				e = d.remote.Set(remoteCtx, physical, value, ttl)
				done()
			}
			if e != nil {
				d.Failures.Add(1)
			}
		}
		return value, nil
	})
}
func (d *Distributed) Health(ctx context.Context) error {
	remoteCtx, done, e := d.admitted(ctx)
	if e != nil {
		return e
	}
	defer done()
	physical, e := d.physical(remoteCtx, "quote:health")
	if e != nil {
		return e
	}
	if e = d.remote.Set(remoteCtx, physical, json.RawMessage(`true`), time.Second); e != nil {
		return e
	}
	raw, e := d.remote.Get(remoteCtx, physical)
	if e != nil || string(raw) != "true" {
		return errors.New("remote cache health unavailable")
	}
	return nil
}
func (d *Distributed) Close() error { d.cancel(); <-d.stopped; return d.remote.Close() }
