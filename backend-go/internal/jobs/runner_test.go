package jobs

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

func TestRequestsAreCoalescedAndCooldownBounded(t *testing.T) {
	r := New()
	now := time.Date(2026, 10, 13, 0, 0, 0, 0, time.UTC)
	r.Now = func() time.Time { return now }
	if err := r.Add(Job{Name: "filings", Schedule: "*/2 * * * *", Timeout: time.Minute, Cooldown: 10 * time.Minute, Run: func(context.Context) error { return nil }}); err != nil {
		t.Fatal(err)
	}
	if !r.Request("filings") || r.Request("filings") {
		t.Fatal("duplicate job queued")
	}
	s := <-r.queue
	r.execute(context.Background(), s)
	if r.Request("filings") {
		t.Fatal("cooldown bypass")
	}
	now = now.Add(10 * time.Minute)
	if !r.Request("filings") {
		t.Fatal("eligible retry blocked")
	}
}
func TestCronPreservesNodeDayAndWeekdayIntersection(t *testing.T) {
	r := New()
	r.Now = func() time.Time { return time.Date(2026, 10, 13, 0, 0, 0, 0, time.UTC) }
	if err := r.Add(Job{Name: "monthly", Schedule: "0 0 1 * MON", Timeout: time.Minute, Run: func(context.Context) error { return nil }}); err != nil {
		t.Fatal(err)
	}
	next := r.states["monthly"].next
	if next.Day() != 1 || next.Weekday() != time.Monday || next.Location() != time.UTC {
		t.Fatal(next)
	}
	for _, spec := range []string{"*/0 * * * *", "@every 1m", "invalid"} {
		if r.Add(Job{Name: spec, Schedule: spec, Timeout: time.Minute, Run: func(context.Context) error { return nil }}) == nil {
			t.Fatal(spec)
		}
	}
}
func TestFailureAndPanicLeaveJobRetryable(t *testing.T) {
	for _, panicJob := range []bool{false, true} {
		r := New()
		var calls atomic.Int32
		_ = r.Add(Job{Name: "retry", Schedule: "* * * * *", Timeout: time.Minute, Run: func(context.Context) error {
			calls.Add(1)
			if panicJob {
				panic("private source")
			}
			return errors.New("fixture")
		}})
		if !r.Request("retry") {
			t.Fatal("first request")
		}
		r.execute(context.Background(), <-r.queue)
		if !r.Request("retry") {
			t.Fatal("failed job stuck")
		}
		r.execute(context.Background(), <-r.queue)
		if calls.Load() != 2 {
			t.Fatal(calls.Load())
		}
	}
}
func TestCancellationStopsActiveJobAndRejectsNewWork(t *testing.T) {
	r := New()
	started := make(chan struct{})
	done := make(chan error, 1)
	_ = r.Add(Job{Name: "cancel", Schedule: "* * * * *", Initial: true, Timeout: time.Minute, Run: func(ctx context.Context) error { close(started); <-ctx.Done(); return ctx.Err() }})
	ctx, cancel := context.WithCancel(context.Background())
	go func() { done <- r.Run(ctx) }()
	<-started
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("shutdown stuck")
	}
	if r.Request("cancel") {
		t.Fatal("closed runner accepted work")
	}
}
