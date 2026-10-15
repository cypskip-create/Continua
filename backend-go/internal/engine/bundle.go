package engine

import (
	"context"
	"continua/backend/internal/cache"
	"encoding/json"
	"errors"
	"sync"
	"time"
	"unicode/utf16"
)

type BundleInputs interface {
	Profile(context.Context, string, string) (json.RawMessage, error)
	Section(context.Context, string, string, string, string) (json.RawMessage, error)
	Article(context.Context, string) (json.RawMessage, error)
}
type SnapshotObserver interface {
	Observe(context.Context, string, json.RawMessage) (json.RawMessage, error)
}
type bundleFlight struct {
	done       chan struct{}
	raw        json.RawMessage
	err        error
	ctx        context.Context
	cancel     context.CancelFunc
	generation uint64
}
type BundleService struct {
	Inputs      BundleInputs
	Worker      CalculationWorker
	Observer    SnapshotObserver
	Cache       cache.Client
	Now         func() time.Time
	mu          sync.Mutex
	pending     map[string]*bundleFlight
	generations map[string]uint64
	lifetime    context.Context
	cancel      context.CancelFunc
	closed      bool
}

var ErrUnknownCompany = errors.New("This stock is not covered yet")
var ErrBundleCapacity = errors.New("research refresh capacity reached")

func NewBundleService(inputs BundleInputs, worker CalculationWorker, observer SnapshotObserver, c cache.Client) *BundleService {
	if c == nil {
		c = cache.NewMemory()
	}
	ctx, cancel := context.WithCancel(context.Background())
	return &BundleService{Inputs: inputs, Worker: worker, Observer: observer, Cache: c, Now: time.Now, pending: map[string]*bundleFlight{}, generations: map[string]uint64{}, lifetime: ctx, cancel: cancel}
}
func BundleKey(exchange, symbol string) string { return "engine:v5:" + exchange + ":" + symbol }
func LastGoodKey(exchange, symbol string) string {
	return "engine:last-good:v2:" + exchange + ":" + symbol
}

func bundleAge(raw json.RawMessage, now time.Time) time.Duration {
	var b struct {
		GeneratedAt string `json:"generatedAt"`
	}
	if json.Unmarshal(raw, &b) != nil {
		return -1
	}
	at, err := time.Parse(time.RFC3339Nano, b.GeneratedAt)
	if err != nil {
		return -1
	}
	return now.Sub(at)
}
func (s *BundleService) Bundle(ctx context.Context, symbol, exchange string) (json.RawMessage, error) {
	if s.Inputs == nil || s.Worker == nil {
		return nil, errors.New("native research assembly not configured")
	}
	key := exchange + ":" + symbol
	staleKey := LastGoodKey(exchange, symbol)
	cached := s.Cache.Get(staleKey)
	age := bundleAge(cached, s.Now())
	usable := cached != nil && age >= 0 && age < 24*time.Hour
	if usable && age < time.Minute {
		return cached, nil
	}
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return nil, errors.New("research assembly closed")
	}
	flight := s.pending[key]
	if flight == nil {
		if len(s.pending) >= 16 {
			s.mu.Unlock()
			if usable {
				return cached, nil
			}
			return nil, ErrBundleCapacity
		}
		refreshCtx, cancel := context.WithTimeout(s.lifetime, 30*time.Second)
		flight = &bundleFlight{done: make(chan struct{}), ctx: refreshCtx, cancel: cancel, generation: s.generations[key]}
		s.pending[key] = flight
		// An owned, bounded refresh can outlive one reader's cancellation. Shutdown
		// cancels every refresh; there is no detached unbounded goroutine backlog.
		go s.refresh(key, staleKey, symbol, exchange, cached, flight)
	}
	s.mu.Unlock()
	if usable {
		return cached, nil
	} // Never relabel a last-good generatedAt as live.
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-flight.done:
		return append(json.RawMessage(nil), flight.raw...), flight.err
	}
}

func (s *BundleService) refresh(key, staleKey, symbol, exchange string, cached json.RawMessage, flight *bundleFlight) {
	ctx := flight.ctx
	defer flight.cancel()
	raw, err := s.Cache.GetOrLoad(ctx, BundleKey(exchange, symbol), time.Minute, func(ctx context.Context) (json.RawMessage, error) { return s.load(ctx, symbol, exchange) })
	s.mu.Lock()
	defer s.mu.Unlock()
	if flight.generation != s.generations[key] {
		// A newly published filing invalidated this in-flight old-input assembly.
		// GetOrLoad may have filled its key just before cancellation: evict it too.
		s.Cache.Delete(BundleKey(exchange, symbol))
		raw = nil
		err = errors.New("research inputs changed during refresh")
	}
	if err == nil {
		var fresh map[string]json.RawMessage
		var missing []string
		if json.Unmarshal(raw, &fresh) != nil || json.Unmarshal(fresh["unavailable"], &missing) != nil {
			err = errors.New("invalid assembled research response")
		} else {
			retain := false
			for _, name := range missing {
				if name == "Quote" || name == "Financial statements" {
					retain = true
				}
			}
			age := bundleAge(cached, s.Now())
			if retain && cached != nil && age >= 0 && age < 24*time.Hour {
				var previous map[string]json.RawMessage
				if json.Unmarshal(cached, &previous) == nil {
					var generated string
					_ = json.Unmarshal(fresh["generatedAt"], &generated)
					previous["refresh"], _ = json.Marshal(map[string]any{"state": "retained", "failedSections": missing, "attemptedAt": generated})
					raw, err = json.Marshal(previous)
					if err == nil {
						s.Cache.Set(staleKey, raw, 24*time.Hour-age)
					}
				}
			} else {
				s.Cache.Set(staleKey, raw, 24*time.Hour)
			}
		}
	}
	flight.raw = raw
	flight.err = err
	delete(s.pending, key)
	close(flight.done)
}

func (s *BundleService) load(ctx context.Context, symbol, exchange string) (json.RawMessage, error) {
	profileCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	profile, err := s.Inputs.Profile(profileCtx, exchange, symbol)
	cancel()
	if err != nil {
		return nil, err
	}
	if len(profile) == 0 || string(profile) == "null" {
		return nil, ErrUnknownCompany
	}
	var identity struct {
		ID string `json:"id"`
	}
	if json.Unmarshal(profile, &identity) != nil || identity.ID == "" {
		return nil, errors.New("invalid company profile")
	}
	input := map[string]any{"profile": profile, "symbol": symbol, "exchange": exchange}
	unavailable := []string{}
	var mu sync.Mutex
	var wg sync.WaitGroup
	slots := make(chan struct{}, 2)
	sections := []struct {
		field, label string
		fallback     json.RawMessage
	}{
		{"quote", "Quote", json.RawMessage(`null`)}, {"history", "Financial statements", json.RawMessage(`[]`)},
		{"earnings", "Earnings", json.RawMessage(`[]`)}, {"ownership", "Ownership", json.RawMessage(`[]`)},
		{"valuation", "Valuation", json.RawMessage(`null`)}, {"news", "News", json.RawMessage(`[]`)},
		{"technicals", "Technicals", json.RawMessage(`[]`)}, {"actions", "Corporate actions", json.RawMessage(`[]`)},
		{"quarterly", "Quarterly statements", json.RawMessage(`[]`)},
	}
	for _, section := range sections {
		wg.Add(1)
		go func(field, label string, fallback json.RawMessage) {
			defer wg.Done()
			deadline := 6 * time.Second
			if field == "history" || field == "quarterly" {
				deadline = 15 * time.Second
			}
			sub, cancel := context.WithTimeout(ctx, deadline)
			defer cancel()
			var raw json.RawMessage
			var e error
			select {
			case slots <- struct{}{}:
				raw, e = s.Inputs.Section(sub, field, identity.ID, exchange, symbol)
				<-slots
			case <-sub.Done():
				e = sub.Err()
			}
			if e == nil && (!json.Valid(raw) || len(raw) > 1048576) {
				e = errors.New("research section limit")
			}
			mu.Lock()
			defer mu.Unlock()
			if e != nil {
				unavailable = append(unavailable, label)
				raw = fallback
			}
			input[field] = raw
		}(section.field, section.label, section.fallback)
	}
	wg.Wait()
	var news []struct {
		ID          string `json:"id"`
		NeedsReview bool   `json:"needsReview"`
	}
	if json.Unmarshal(input["news"].(json.RawMessage), &news) != nil {
		return nil, errors.New("invalid news section")
	}
	articles := map[string]any{}
	selected := 0
	for _, item := range news {
		if item.NeedsReview {
			continue
		}
		if selected >= 6 {
			break
		}
		selected++
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			sub, cancel := context.WithTimeout(ctx, 6*time.Second)
			defer cancel()
			var raw json.RawMessage
			var e error
			select {
			case slots <- struct{}{}:
				raw, e = s.Inputs.Article(sub, id)
				<-slots
			case <-sub.Done():
				e = sub.Err()
			}
			var article struct {
				Content *string `json:"content"`
			}
			if e == nil && len(raw) > 0 && json.Unmarshal(raw, &article) != nil {
				e = errors.New("invalid article response")
			}
			if article.Content != nil {
				units := utf16.Encode([]rune(*article.Content))
				if len(units) > 30000 {
					units = units[:30000]
				}
				value := string(utf16.Decode(units))
				article.Content = &value
			}
			mu.Lock()
			defer mu.Unlock()
			if e != nil {
				unavailable = append(unavailable, "Article text")
				articles[id] = nil
			} else {
				articles[id] = article
			}
		}(item.ID)
	}
	wg.Wait()
	input["articles"] = articles
	if len(unavailable) == 0 && s.Observer == nil {
		unavailable = append(unavailable, "Change history")
	}
	input["unavailable"] = unavailable
	now := s.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	assembled, err := s.Worker.Calculate(ctx, Request{Operation: "assemble_company_bundle", Args: []any{input, now}})
	if err != nil {
		return nil, err
	}
	var result struct {
		Bundle          map[string]json.RawMessage `json:"bundle"`
		State           json.RawMessage            `json:"state"`
		ObserveEligible bool                       `json:"observeEligible"`
	}
	if json.Unmarshal(assembled, &result) != nil || result.Bundle == nil {
		return nil, errors.New("invalid research assembly")
	}
	if result.ObserveEligible && s.Observer != nil {
		changes, e := s.Observer.Observe(ctx, identity.ID, result.State)
		if e == nil && json.Valid(changes) {
			result.Bundle["changes"] = changes
		} else {
			unavailable = append(unavailable, "Change history")
			result.Bundle["unavailable"], _ = json.Marshal(unavailable)
			// Rebuild coverage/partial metadata from the now-incomplete input, without
			// writing a false baseline or pretending the history service succeeded.
			input["unavailable"] = unavailable
			assembled, e = s.Worker.Calculate(ctx, Request{Operation: "assemble_company_bundle", Args: []any{input, now}})
			if e != nil {
				return nil, e
			}
			if json.Unmarshal(assembled, &result) != nil {
				return nil, errors.New("invalid partial research assembly")
			}
		}
	}
	return json.Marshal(result.Bundle)
}

func (s *BundleService) Invalidate(exchange, symbol string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := exchange + ":" + symbol
	s.generations[key]++
	if f := s.pending[key]; f != nil {
		f.cancel()
	}
	s.Cache.Delete(BundleKey(exchange, symbol))
	s.Cache.Delete(LastGoodKey(exchange, symbol))
}
func (s *BundleService) Close(ctx context.Context) error {
	s.mu.Lock()
	s.closed = true
	s.cancel()
	done := make([]chan struct{}, 0, len(s.pending))
	for _, f := range s.pending {
		done = append(done, f.done)
	}
	s.mu.Unlock()
	for _, ch := range done {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ch:
		}
	}
	return nil
}
