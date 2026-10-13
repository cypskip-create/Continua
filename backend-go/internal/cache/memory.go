// Package cache provides a byte-bounded LRU with coalesced, cancellable loads.
// Billing and subscription verification must never use this cache.
package cache

import (
	"container/list"
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"
)

var ErrBusy = errors.New("cache load capacity reached")

type entry struct {
	key     string
	value   json.RawMessage
	expires time.Time
}
type flight struct {
	done  chan struct{}
	value json.RawMessage
	err   error
}
type Memory struct {
	mu                                      sync.Mutex
	items                                   map[string]*list.Element
	lru                                     *list.List
	pending                                 map[string]*flight
	bytes, maxBytes, maxEntries, maxPending int
	Now                                     func() time.Time
}

func NewMemory() *Memory {
	return &Memory{items: map[string]*list.Element{}, lru: list.New(), pending: map[string]*flight{}, maxBytes: 4 * 1024 * 1024, maxEntries: 5000, maxPending: 64, Now: time.Now}
}
func clone(value json.RawMessage) json.RawMessage { return append(json.RawMessage(nil), value...) }
func (c *Memory) remove(element *list.Element) {
	e := element.Value.(entry)
	delete(c.items, e.key)
	c.bytes -= len(e.key) + len(e.value)
	c.lru.Remove(element)
}
func (c *Memory) get(key string) json.RawMessage {
	element := c.items[key]
	if element == nil {
		return nil
	}
	e := element.Value.(entry)
	if !c.Now().Before(e.expires) {
		c.remove(element)
		return nil
	}
	if string(e.value) == "null" {
		return nil
	}
	c.lru.MoveToFront(element)
	return clone(e.value)
}
func (c *Memory) Get(key string) json.RawMessage { c.mu.Lock(); defer c.mu.Unlock(); return c.get(key) }
func (c *Memory) Set(key string, value json.RawMessage, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if element := c.items[key]; element != nil {
		c.remove(element)
	}
	size := len(key) + len(value)
	if size > c.maxBytes || ttl <= 0 || !json.Valid(value) {
		return
	}
	for c.bytes+size > c.maxBytes || len(c.items) >= c.maxEntries {
		c.remove(c.lru.Back())
	}
	c.items[key] = c.lru.PushFront(entry{key, clone(value), c.Now().Add(ttl)})
	c.bytes += size
}
func (c *Memory) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if e := c.items[key]; e != nil {
		c.remove(e)
	}
}
func (c *Memory) GetOrLoad(ctx context.Context, key string, ttl time.Duration, load func(context.Context) (json.RawMessage, error)) (json.RawMessage, error) {
	c.mu.Lock()
	if value := c.get(key); value != nil {
		c.mu.Unlock()
		return value, nil
	}
	if job := c.pending[key]; job != nil {
		c.mu.Unlock()
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-job.done:
			return clone(job.value), job.err
		}
	}
	if len(c.pending) >= c.maxPending {
		c.mu.Unlock()
		return nil, ErrBusy
	}
	job := &flight{done: make(chan struct{})}
	c.pending[key] = job
	c.mu.Unlock()
	// Run in the leader request, not a detached unbounded goroutine. A canceled
	// follower does not cancel the leader; loader errors are never cached.
	value, err := load(ctx)
	if err == nil {
		c.Set(key, value, ttl)
	}
	c.mu.Lock()
	job.value = clone(value)
	job.err = err
	delete(c.pending, key)
	close(job.done)
	c.mu.Unlock()
	return value, err
}
