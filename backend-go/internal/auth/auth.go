package auth

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"golang.org/x/crypto/scrypt"
	"net/http"
	"strings"
	"sync"
	"time"
)

type APIKey struct {
	ID              string
	Name            string
	Active          bool
	RateLimitPerMin int
}
type KeyStore interface {
	FindActiveKey(context.Context, string) (*APIKey, error)
	TouchKey(context.Context, string) error
}
type entry struct {
	record  *APIKey
	expires time.Time
}
type Authenticator struct {
	Store          KeyStore
	Enabled        bool
	DevelopmentKey string
	Production     bool
	DefaultLimit   int
	now            func() time.Time
	mu             sync.Mutex
	cache          map[string]entry
	touches        map[string]time.Time
	slots          chan struct{}
}

var ErrMissing = errors.New("Missing API key — supply 'Authorization: Bearer <key>' or 'X-API-Key: <key>'")
var ErrInvalid = errors.New("Invalid or revoked API key")

func New(store KeyStore, production bool) *Authenticator {
	return &Authenticator{Store: store, Production: production, Enabled: true, DefaultLimit: 120, now: time.Now, cache: map[string]entry{}, touches: map[string]time.Time{}, slots: make(chan struct{}, 2)}
}
func ExtractKey(header http.Header) string {
	if v := header.Get("Authorization"); strings.HasPrefix(v, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(v, "Bearer "))
	}
	return strings.TrimSpace(header.Get("X-API-Key"))
}
func HashKey(value string) (string, error) {
	key, err := scrypt.Key([]byte(value), []byte("market.api_keys.v1"), 16384, 8, 1, 32)
	return hex.EncodeToString(key), err
}
func (a *Authenticator) Authenticate(ctx context.Context, header http.Header) (*APIKey, error) {
	if !a.Enabled && !a.Production {
		return nil, nil
	}
	presented := ExtractKey(header)
	if presented == "" {
		return nil, ErrMissing
	}
	if len(presented) > 4096 {
		return nil, ErrInvalid
	}
	if !a.Production && a.DevelopmentKey != "" && subtle.ConstantTimeCompare([]byte(presented), []byte(a.DevelopmentKey)) == 1 {
		return &APIKey{ID: "dev", Name: "dev-key", Active: true, RateLimitPerMin: a.DefaultLimit}, nil
	}
	fingerprint := sha256.Sum256([]byte(presented))
	cacheKey := hex.EncodeToString(fingerprint[:])
	now := a.now()
	a.mu.Lock()
	cached, ok := a.cache[cacheKey]
	a.mu.Unlock()
	if ok && now.Before(cached.expires) {
		if cached.record == nil {
			return nil, ErrInvalid
		}
		copy := *cached.record
		return &copy, nil
	}
	select {
	case a.slots <- struct{}{}:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	defer func() { <-a.slots }()
	// Recheck after acquiring the bounded KDF budget; cache contains no plaintext.
	a.mu.Lock()
	cached, ok = a.cache[cacheKey]
	a.mu.Unlock()
	if ok && a.now().Before(cached.expires) {
		if cached.record == nil {
			return nil, ErrInvalid
		}
		copy := *cached.record
		return &copy, nil
	}
	hash, err := HashKey(presented)
	if err != nil {
		return nil, err
	}
	record, err := a.Store.FindActiveKey(ctx, hash)
	if err != nil {
		return nil, err
	}
	if record != nil && !record.Active {
		record = nil
	}
	a.mu.Lock()
	if len(a.cache) >= 1000 {
		for k, v := range a.cache {
			if !now.Before(v.expires) {
				delete(a.cache, k)
			}
		}
		if len(a.cache) >= 1000 {
			for k := range a.cache {
				delete(a.cache, k)
				break
			}
		}
	}
	a.cache[cacheKey] = entry{record: record, expires: now.Add(30 * time.Second)}
	a.mu.Unlock()
	if record == nil {
		return nil, ErrInvalid
	}
	a.touch(record.ID, now)
	copy := *record
	return &copy, nil
}
func (a *Authenticator) touch(id string, now time.Time) {
	a.mu.Lock()
	if until, ok := a.touches[id]; ok && now.Before(until) {
		a.mu.Unlock()
		return
	}
	if len(a.touches) >= 1000 {
		for k, v := range a.touches {
			if !now.Before(v) {
				delete(a.touches, k)
			}
		}
		if len(a.touches) >= 1000 {
			a.mu.Unlock()
			return
		}
	}
	a.touches[id] = now.Add(time.Minute)
	a.mu.Unlock()
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = a.Store.TouchKey(ctx, id)
	}()
}
