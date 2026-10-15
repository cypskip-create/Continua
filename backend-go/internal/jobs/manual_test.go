package jobs

import (
	"context"
	"testing"
	"time"
)

func TestManualReaderJobsNeverBecomeTimerKeepalive(t *testing.T) {
	runner := New()
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	runner.Now = func() time.Time { return now }
	if e := runner.AddManual(Job{Name: "collector", Timeout: time.Second, Cooldown: 15 * time.Minute, Run: func(context.Context) error { return nil }}); e != nil {
		t.Fatal(e)
	}
	runner.Tick(now.Add(366 * 24 * time.Hour))
	if len(runner.queue) != 0 {
		t.Fatal("manual job became timed keepalive")
	}
	if !runner.Request("collector") || runner.Request("collector") {
		t.Fatal("manual requests not coalesced")
	}
	state := <-runner.queue
	runner.execute(context.Background(), state)
	if runner.Request("collector") {
		t.Fatal("reader cooldown bypassed")
	}
	now = now.Add(16 * time.Minute)
	if !runner.Request("collector") {
		t.Fatal("reader did not recover after cooldown")
	}
}
