package ingestion

import (
	"context"
	"errors"
	"strings"
	"sync"
	"unicode"
)

type CollectionFailure struct {
	Symbol    string `json:"symbol"`
	ErrorCode string `json:"error"`
}
type Collection[T any] struct {
	Records  []T
	Failures []CollectionFailure
}

// CollectSymbols replaces unbounded allSettled fanout while preserving input
// order, successful empty results and every failed symbol's audit receipt.
// No provider exception text is copied to API/log/database failure summaries.
func CollectSymbols[T any](ctx context.Context, symbols []string, fetch func(context.Context, string) ([]T, error)) (Collection[T], error) {
	result := Collection[T]{Records: []T{}, Failures: []CollectionFailure{}}
	if ctx == nil || fetch == nil || len(symbols) > 1000 {
		return result, errors.New("invalid collection batch")
	}
	for _, symbol := range symbols {
		if len(symbol) == 0 || len(symbol) > 100 || strings.TrimSpace(symbol) != symbol || strings.ContainsFunc(symbol, unicode.IsControl) {
			return result, errors.New("invalid collection symbol")
		}
	}
	if err := ctx.Err(); err != nil {
		return result, err
	}
	type receipt struct {
		records []T
		err     error
	}
	receipts := make([]receipt, len(symbols))
	jobs := make(chan int)
	var workers sync.WaitGroup
	for n := 0; n < min(2, len(symbols)); n++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for i := range jobs {
				if ctx.Err() != nil {
					receipts[i].err = ctx.Err()
					continue
				}
				receipts[i].records, receipts[i].err = Retry(ctx, DefaultRetryOptions(), func(ctx context.Context) ([]T, error) { return fetch(ctx, symbols[i]) })
			}
		}()
	}
	for i := range symbols {
		jobs <- i
	}
	close(jobs)
	workers.Wait()
	for i, receipt := range receipts {
		if receipt.err != nil {
			result.Failures = append(result.Failures, CollectionFailure{symbols[i], "collection-failed"})
		} else {
			result.Records = append(result.Records, receipt.records...)
		}
	}
	return result, ctx.Err()
}

// Fundamentals history, when supported, is authoritative even if it returns an
// empty list. Only adapters lacking history use their nullable latest result.
func CollectFundamentals[T any](ctx context.Context, symbols []string, history func(context.Context, string) ([]T, error), latest func(context.Context, string) (*T, error)) (Collection[T], error) {
	if history != nil {
		return CollectSymbols(ctx, symbols, history)
	}
	if latest == nil {
		return Collection[T]{}, errors.New("fundamentals adapter missing")
	}
	return CollectSymbols(ctx, symbols, func(ctx context.Context, symbol string) ([]T, error) {
		value, err := latest(ctx, symbol)
		if err != nil {
			return nil, err
		}
		if value == nil {
			return []T{}, nil
		}
		return []T{*value}, nil
	})
}

func CollectQuotes[T any](ctx context.Context, symbols []string, fetch func(context.Context, []string) ([]T, error)) ([]T, error) {
	if fetch == nil || len(symbols) > 1000 {
		return nil, errors.New("quote adapter or batch invalid")
	}
	// Own the caller's slice before handing it to a source adapter.
	copySymbols := append([]string{}, symbols...)
	return Retry(ctx, DefaultRetryOptions(), func(ctx context.Context) ([]T, error) { return fetch(ctx, append([]string{}, copySymbols...)) })
}

func CollectIndices[T any](ctx context.Context, fetch func(context.Context) ([]T, error)) ([]T, error) {
	if fetch == nil {
		return nil, errors.New("index adapter missing")
	}
	return Retry(ctx, DefaultRetryOptions(), fetch)
}
