package engine

import (
	"context"
	"continua/backend/internal/cache"
	"continua/backend/internal/maintenance"
	"continua/backend/internal/marketdata"
	"net/url"
	"os"
	"testing"
	"time"
)

// Explicit opt-in read-only deployment comparison. Never used by ordinary CI.
func TestOwnedReadOnlyNewsDeadline(t *testing.T) {
	connection := os.Getenv("NATIVE_READONLY_NEWS_FIXTURE_URL")
	if connection == "" {
		t.Skip("explicit owned read-only database fixture required")
	}
	target, err := url.Parse(connection)
	if err != nil || target.User == nil || target.Hostname() == "" {
		t.Fatal("invalid fixture configuration")
	}
	query := target.Query()
	query.Set("options", "-c default_transaction_read_only=on")
	target.RawQuery = query.Encode()
	store, err := marketdata.Open(target.String())
	if err != nil {
		t.Fatal("fixture configuration rejected")
	}
	defer store.DB.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	id, err := store.SecurityID(ctx, "NSE", "COOP")
	if err != nil || id == nil {
		t.Fatal("fixture issuer unavailable")
	}
	normal := worker(t)
	reader := NewsReader{Store: store, Worker: NewEvidenceWorker(normal.Python, normal.Script), Cache: cache.NewMemory(), Observe: func(stage string, duration time.Duration, e error) {
		code := "ok"
		if e != nil {
			code = maintenance.SafeDatabaseCode(e)
		}
		t.Logf("news stage=%s duration_ms=%d outcome=%s", stage, duration.Milliseconds(), code)
	}}
	started := time.Now()
	rows, err := reader.List(ctx, id, nil, 3)
	if err != nil {
		t.Fatalf("news read failed after %dms (%s)", time.Since(started).Milliseconds(), maintenance.SafeDatabaseCode(err))
	}
	t.Logf("news results=%d elapsed_ms=%d", len(rows), time.Since(started).Milliseconds())
}
