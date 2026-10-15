package marketdata

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

func verifyIngestionAuditPostgresFixture(t *testing.T, store *Store, ctx context.Context) {
	t.Helper()
	now := time.Now().UTC()
	if err := store.RecordIngestionRun(ctx, IngestionRun{Exchange: "NSE", Dataset: "price", Status: "failed", ErrorCount: 1, StartedAt: now.Add(-time.Second), FinishedAt: now, Errors: []string{"validation-failed"}}); err != nil {
		t.Fatal("actual ingestion audit failed", err)
	}
	symbol := "KCB"
	good := DeadLetter{Exchange: "NSE", Dataset: "price", Symbol: &symbol, Payload: json.RawMessage(`{"symbol":"KCB","lastPrice":-1}`), ErrorCode: "validation-failed"}
	bad := good
	bad.Payload = json.RawMessage(`invalid`)
	if store.RecordDeadLetters(ctx, []DeadLetter{good, bad}) == nil {
		t.Fatal("invalid later receipt was accepted")
	}
	logs, err := store.RecentIngestionRuns(ctx, 0)
	if err != nil || len(logs) != 1 {
		t.Fatal("audit log receipt missing", err)
	}
	failures, err := store.RecentDeadLetters(ctx, 0)
	if err != nil || len(failures) != 1 {
		t.Fatal("earlier dead-letter receipt lost", err)
	}
	var failure struct {
		Error      string `json:"error"`
		OccurredAt string `json:"occurredAt"`
		Payload    struct {
			LastPrice float64 `json:"lastPrice"`
		} `json:"payload"`
	}
	if json.Unmarshal(failures[0], &failure) != nil || failure.Error != "validation-failed" || failure.Payload.LastPrice != -1 {
		t.Fatal("failure evidence changed")
	}
	if _, err := time.Parse(time.RFC3339Nano, failure.OccurredAt); err != nil {
		t.Fatal("invalid audit wire timestamp")
	}
}
