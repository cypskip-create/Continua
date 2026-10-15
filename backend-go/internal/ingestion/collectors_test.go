package ingestion

import (
	"context"
	"errors"
	"reflect"
	"sync/atomic"
	"testing"
)

func TestSymbolCollectorsRetainOrderFailuresAndBoundConcurrency(t *testing.T) {
	var active, peak atomic.Int32
	result, err := CollectSymbols(context.Background(), []string{"A", "B", "C"}, func(ctx context.Context, symbol string) ([]string, error) {
		n := active.Add(1)
		defer active.Add(-1)
		for old := peak.Load(); n > old; old = peak.Load() {
			if peak.CompareAndSwap(old, n) {
				break
			}
		}
		if symbol == "B" {
			return nil, fixtureStatus(403)
		}
		return []string{symbol, symbol + "2"}, nil
	})
	if err != nil || !reflect.DeepEqual(result.Records, []string{"A", "A2", "C", "C2"}) || len(result.Failures) != 1 || result.Failures[0].Symbol != "B" || peak.Load() > 2 {
		t.Fatal(result, err, peak.Load())
	}
}

func TestFundamentalsHistoryDoesNotFallBackOnEmptyHistory(t *testing.T) {
	latestCalls := 0
	latest := func(context.Context, string) (*int, error) { latestCalls++; return nil, nil }
	result, err := CollectFundamentals(context.Background(), []string{"A"}, func(context.Context, string) ([]int, error) { return []int{}, nil }, latest)
	if err != nil || len(result.Records) != 0 || latestCalls != 0 {
		t.Fatal(result, err, latestCalls)
	}
	result, err = CollectFundamentals[int](context.Background(), []string{"A"}, nil, latest)
	if err != nil || len(result.Records) != 0 || latestCalls != 1 {
		t.Fatal(result, err, latestCalls)
	}
}

func TestCollectorsCancelAndNeverExposeProviderErrorText(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	result, err := CollectSymbols(ctx, []string{"A", "B", "C"}, func(context.Context, string) ([]int, error) {
		cancel()
		return nil, errors.New("credential-containing provider failure")
	})
	if !errors.Is(err, context.Canceled) || len(result.Failures) != 3 {
		t.Fatal(result, err)
	}
	for _, failure := range result.Failures {
		if failure.ErrorCode != "collection-failed" {
			t.Fatal(failure)
		}
	}
}

func TestQuoteAndIndexCollectorsRetryWithoutMutatingInput(t *testing.T) {
	symbols := []string{"KCB"}
	calls := 0
	quotes, err := CollectQuotes(context.Background(), symbols, func(_ context.Context, received []string) ([]int, error) {
		calls++
		received[0] = "changed"
		return []int{42}, nil
	})
	if err != nil || calls != 1 || symbols[0] != "KCB" || quotes[0] != 42 {
		t.Fatal(quotes, err, symbols)
	}
	indices, err := CollectIndices(context.Background(), func(context.Context) ([]int, error) { return []int{}, nil })
	if err != nil || len(indices) != 0 {
		t.Fatal(indices, err)
	}
}
