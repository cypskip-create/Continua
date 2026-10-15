package ingestion

import (
	"context"
	"errors"
	"math"
	"time"
)

type RetryOptions struct {
	Retries   int
	BaseDelay time.Duration
	Factor    float64
}

func DefaultRetryOptions() RetryOptions { return RetryOptions{2, 300 * time.Millisecond, 2} }

// HTTPStatus errors let adapters preserve the legacy quota policy without
// importing a provider SDK. A provider with burst-rate 429s needs its own policy.
type statusError interface{ HTTPStatus() int }

func permanentProviderError(err error) bool {
	var status statusError
	if !errors.As(err, &status) {
		return false
	}
	switch status.HTTPStatus() {
	case 401, 403, 404, 429:
		return true
	}
	return false
}

// Retry never logs provider errors, which may contain credentials or URLs.
// The callback must honor ctx; cancellation does not abandon a live goroutine.
func Retry[T any](ctx context.Context, options RetryOptions, operation func(context.Context) (T, error)) (T, error) {
	return retryWithWait(ctx, options, operation, waitForRetry)
}

func waitForRetry(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func retryWithWait[T any](ctx context.Context, options RetryOptions, operation func(context.Context) (T, error), wait func(context.Context, time.Duration) error) (T, error) {
	var zero T
	if ctx == nil || operation == nil || wait == nil || options.Retries < 0 || options.Retries > 10 || options.BaseDelay < 0 || options.BaseDelay > time.Minute || math.IsNaN(options.Factor) || math.IsInf(options.Factor, 0) || options.Factor < 1 || options.Factor > 10 {
		return zero, errors.New("invalid retry policy")
	}
	// Validate the complete schedule before invoking any externally mutating call.
	delays := make([]time.Duration, options.Retries)
	for i := range delays {
		delay := float64(options.BaseDelay) * math.Pow(options.Factor, float64(i))
		if delay > float64(time.Minute) {
			return zero, errors.New("retry delay budget exceeded")
		}
		delays[i] = time.Duration(delay)
	}
	for attempt := 0; ; attempt++ {
		if err := ctx.Err(); err != nil {
			return zero, err
		}
		result, err := operation(ctx)
		if err == nil {
			return result, nil
		}
		if ctx.Err() != nil {
			return zero, ctx.Err()
		}
		if attempt == options.Retries || permanentProviderError(err) || errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return zero, err
		}
		if err = wait(ctx, delays[attempt]); err != nil {
			return zero, err
		}
	}
}
