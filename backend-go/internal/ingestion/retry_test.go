package ingestion

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

type fixtureStatus int

func (s fixtureStatus) Error() string   { return "private provider failure" }
func (s fixtureStatus) HTTPStatus() int { return int(s) }

func TestRetryPreservesAttemptCountBackoffAndResult(t *testing.T) {
	count := 0
	delays := []time.Duration{}
	result, err := retryWithWait(context.Background(), DefaultRetryOptions(), func(context.Context) (int, error) {
		count++
		if count < 3 {
			return 0, errors.New("transient")
		}
		return 42, nil
	}, func(_ context.Context, d time.Duration) error { delays = append(delays, d); return nil })
	if err != nil || result != 42 || count != 3 || len(delays) != 2 || delays[0] != 300*time.Millisecond || delays[1] != 600*time.Millisecond {
		t.Fatal(result, err, count, delays)
	}
}

func TestRetryDoesNotSpendExhaustedProviderQuota(t *testing.T) {
	for _, status := range []fixtureStatus{401, 403, 404, 429} {
		count := 0
		failure := fmt.Errorf("wrapped: %w", status)
		_, err := retryWithWait(context.Background(), DefaultRetryOptions(), func(context.Context) (int, error) { count++; return 0, failure }, func(context.Context, time.Duration) error { t.Fatal("permanent error retried"); return nil })
		if err != failure || count != 1 {
			t.Fatal(status, count, err)
		}
	}
}

func TestRetryCancellationAndPolicyFailBeforeExternalCalls(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	count := 0
	operation := func(context.Context) (int, error) { count++; return 0, errors.New("failure") }
	if _, err := Retry(ctx, DefaultRetryOptions(), operation); !errors.Is(err, context.Canceled) || count != 0 {
		t.Fatal(count, err)
	}
	for _, options := range []RetryOptions{{-1, 0, 2}, {11, 0, 2}, {2, -1, 2}, {10, time.Minute, 10}, {2, 0, 0}} {
		if _, err := Retry(context.Background(), options, operation); err == nil || count != 0 {
			t.Fatal(options, count, err)
		}
	}
	ctx, cancel = context.WithCancel(context.Background())
	_, err := retryWithWait(ctx, DefaultRetryOptions(), operation, func(ctx context.Context, _ time.Duration) error { cancel(); return waitForRetry(ctx, time.Hour) })
	if !errors.Is(err, context.Canceled) || count != 1 {
		t.Fatal(count, err)
	}
}

func TestRetryExhaustionPreservesFinalFailure(t *testing.T) {
	failure := errors.New("final")
	count := 0
	_, err := retryWithWait(context.Background(), DefaultRetryOptions(), func(context.Context) (int, error) { count++; return 0, failure }, func(context.Context, time.Duration) error { return nil })
	if err != failure || count != 3 {
		t.Fatal(count, err)
	}
}
