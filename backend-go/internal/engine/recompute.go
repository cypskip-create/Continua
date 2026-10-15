package engine

import (
	"context"
	"continua/backend/internal/marketdata"
	"encoding/json"
	"errors"
	"math"
	"strings"
	"sync"
	"time"
)

type RecomputeService struct {
	Store   *marketdata.Store
	Worker  CalculationWorker
	Now     func() time.Time
	mu      sync.Mutex
	pending map[string]*bundleFlight
}

func NewRecomputeService(store *marketdata.Store, worker CalculationWorker) *RecomputeService {
	return &RecomputeService{Store: store, Worker: worker, Now: time.Now, pending: map[string]*bundleFlight{}}
}
func (s *RecomputeService) Recompute(ctx context.Context, id string) (json.RawMessage, error) {
	s.mu.Lock()
	flight := s.pending[id]
	if flight != nil {
		s.mu.Unlock()
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-flight.done:
			return append(json.RawMessage(nil), flight.raw...), flight.err
		}
	}
	if len(s.pending) >= 16 {
		s.mu.Unlock()
		return nil, ErrBundleCapacity
	}
	flight = &bundleFlight{done: make(chan struct{})}
	s.pending[id] = flight
	s.mu.Unlock()
	raw, err := s.compute(ctx, id)
	s.mu.Lock()
	flight.raw = raw
	flight.err = err
	delete(s.pending, id)
	close(flight.done)
	s.mu.Unlock()
	return raw, err
}
func (s *RecomputeService) compute(ctx context.Context, id string) (json.RawMessage, error) {
	if s.Store == nil || s.Worker == nil {
		return nil, errors.New("native research recompute unavailable")
	}
	exchange, symbol, ok := strings.Cut(id, ":")
	if !ok || exchange != "NSE" || symbol == "" {
		return nil, errors.New("invalid research security")
	}
	quotes, err := s.Store.Quotes(ctx, exchange, []string{symbol})
	if err != nil {
		return nil, err
	}
	if len(quotes) == 0 {
		return nil, nil
	}
	var quote struct {
		Timestamp string  `json:"timestamp"`
		LastPrice float64 `json:"lastPrice"`
		Source    string  `json:"source"`
	}
	if json.Unmarshal(quotes[0], &quote) != nil {
		return nil, errors.New("invalid research quote")
	}
	at, err := time.Parse(time.RFC3339Nano, quote.Timestamp)
	if err != nil {
		return nil, errors.New("invalid research quote date")
	}
	now := time.Now()
	if s.Now != nil {
		now = s.Now()
	}
	if !usableResearchQuote(at, now, quote.LastPrice, quote.Source) {
		return nil, nil
	}
	basis, err := s.Store.ResearchBasis(ctx, id, quote.Timestamp)
	if err != nil {
		return nil, err
	}
	history, err := s.Store.FinancialHistory(ctx, id, "annual", 50)
	if err != nil {
		return nil, err
	}
	candles, err := s.Store.Candles(ctx, id, "1d", at.Add(-90*24*time.Hour), at)
	if err != nil {
		return nil, err
	}
	dividends, err := s.Store.Dividends(ctx, id)
	if err != nil {
		return nil, err
	}
	raw, err := s.Worker.Calculate(ctx, Request{Operation: "research_snapshot", Args: []any{id, quotes[0], history, candles, dividends, now.UTC().Format("2006-01-02T15:04:05.000Z")}})
	if err != nil {
		return nil, err
	}
	if string(raw) == "null" {
		return nil, nil
	}
	var result struct {
		Ratios json.RawMessage `json:"ratios"`
		Score  json.RawMessage `json:"score"`
	}
	if json.Unmarshal(raw, &result) != nil || !json.Valid(result.Ratios) || !json.Valid(result.Score) {
		return nil, errors.New("invalid derived research response")
	}
	result.Score, err = marketdata.WithNativeResearchBasis(result.Ratios, result.Score, basis, quote.LastPrice)
	if err != nil {
		return nil, err
	}
	stored, err := s.Store.PersistResearch(ctx, result.Ratios, result.Score, basis, quote.LastPrice)
	if err != nil {
		return nil, err
	}
	if !stored {
		return nil, nil
	}
	return json.Marshal(result)
}

func usableResearchQuote(at, now time.Time, price float64, source string) bool {
	return !at.After(now) && now.Sub(at) < 7*24*time.Hour && price > 0 && !math.IsNaN(price) && !math.IsInf(price, 0) && source != "mock"
}

func (s *RecomputeService) All(ctx context.Context, exchange string) (map[string]int, error) {
	if exchange != "NSE" {
		return nil, errors.New("invalid research exchange")
	}
	securities, err := s.Store.Instruments(ctx, exchange)
	if err != nil {
		return nil, err
	}
	summary := map[string]int{"computed": 0, "skipped": 0}
	for _, raw := range securities {
		var security struct {
			ID string `json:"securityId"`
		}
		if json.Unmarshal(raw, &security) != nil || security.ID == "" {
			return nil, errors.New("invalid research universe")
		}
		result, e := s.Recompute(ctx, security.ID)
		if e != nil {
			return nil, e
		}
		if result == nil {
			summary["skipped"]++
		} else {
			summary["computed"]++
		}
	}
	return summary, nil
}
