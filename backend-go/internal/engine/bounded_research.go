package engine

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

var enrichmentSlots = make(chan struct{}, 4)

type ResearchBudget struct {
	Duration    time.Duration
	Concurrency int
}
type enrichmentResult struct {
	index int
	raw   json.RawMessage
}

// One shared deadline, stable output order and null optional failures. The
// process-wide admission budget also bounds callbacks that fail to honor ctx;
// timeout does not launch an unbounded population of abandoned goroutines.
func BoundedResearch(ctx context.Context, items []string, load func(context.Context, string) (json.RawMessage, error), budget ResearchBudget) ([]json.RawMessage, error) {
	if ctx == nil || load == nil || len(items) > 2000 || budget.Duration <= 0 || budget.Duration > 30*time.Second || budget.Concurrency < 1 || budget.Concurrency > 4 {
		return nil, errors.New("invalid optional research budget")
	}
	result := make([]json.RawMessage, len(items))
	if len(items) == 0 {
		return result, nil
	}
	items = append([]string{}, items...)
	bounded, cancel := context.WithTimeout(ctx, budget.Duration)
	defer cancel()
	local := make(chan struct{}, budget.Concurrency)
	completed := make(chan enrichmentResult, budget.Concurrency)
	go func() {
		for index, item := range items {
			select {
			case local <- struct{}{}:
			case <-bounded.Done():
				return
			}
			select {
			case enrichmentSlots <- struct{}{}:
			case <-bounded.Done():
				<-local
				return
			}
			go func(index int, item string) {
				var raw json.RawMessage
				defer func() {
					if recover() != nil {
						raw = nil
					}
					select {
					case completed <- enrichmentResult{index, raw}:
					case <-bounded.Done():
					}
					<-enrichmentSlots
					<-local
				}()
				value, err := load(bounded, item)
				if err == nil && len(value) <= 262144 && json.Valid(value) {
					raw = append(json.RawMessage{}, value...)
				}
			}(index, item)
		}
	}()
	bytes := 0
	for received := 0; received < len(items); received++ {
		select {
		case <-bounded.Done():
			return result, nil
		case item := <-completed:
			if bytes+len(item.raw) > 8*1024*1024 {
				return result, nil
			}
			result[item.index] = item.raw
			bytes += len(item.raw)
		}
	}
	return result, nil
}
