package diagnostics

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRuntimeSnapshotUsesLocalCountersWithoutDatabase(t *testing.T) {
	runtime := New(nil)
	snapshot := runtime.Snapshot()
	if snapshot.Goroutines < 1 || snapshot.UptimeSeconds < 0 || snapshot.Timestamp == "" || snapshot.HeapReservedBytes < snapshot.HeapAllocatedBytes {
		t.Fatal("invalid local runtime counters")
	}
	if snapshot.DatabaseConnections != 0 || snapshot.DatabaseWaitCount != 0 {
		t.Fatal("invented database measurements")
	}
	if _, err := json.Marshal(snapshot); err != nil {
		t.Fatal("nonfinite runtime output", err)
	}
}

func TestBoundedCgroupReaderRejectsUnboundedOrUnknownLimits(t *testing.T) {
	directory := t.TempDir()
	unknown := filepath.Join(directory, "unknown")
	valid := filepath.Join(directory, "valid")
	large := filepath.Join(directory, "large")
	for path, value := range map[string]string{unknown: "max", valid: "12345\n", large: strings.Repeat("1", 65)} {
		if err := os.WriteFile(path, []byte(value), 0600); err != nil {
			t.Fatal(err)
		}
	}
	if boundedNumber(unknown, large) != nil {
		t.Fatal("invented a numeric cgroup measurement")
	}
	value := boundedNumber(unknown, large, valid)
	if value == nil || *value != 12345 {
		t.Fatal("bounded fallback not read")
	}
}

func TestRuntimeCancellationDoesNotWaitForMinuteTicker(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	done := make(chan struct{})
	go func() {
		New(nil).Run(ctx, func(Snapshot, bool) { t.Error("cancelled diagnostics emitted a sample") })
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("runtime diagnostics ignored cancellation")
	}
}
