package cache

import (
	"context"
	"encoding/json"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"
)

func TestRedisClientHasBoundedPoolsDeadlinesAndTLS(t *testing.T) {
	remote, e := NewRedisRemote("rediss://fixture:fixture@redis.fixture.example:6379/0", "continua-fixture", false)
	if e != nil {
		t.Fatal(e)
	}
	defer remote.Close()
	options := remote.client.Options()
	if options.PoolSize != 2 || options.MaxActiveConns != 2 || options.PipelinePoolSize != -1 || options.MaxRetries != 0 || !options.ContextTimeoutEnabled || options.TLSConfig == nil || options.TLSConfig.InsecureSkipVerify {
		t.Fatal("unbounded or unverified Redis configuration")
	}
}

// Separate opt-in integration gate; never consumes REDIS_URL/production keys.
func TestRedisOwnedFixtureRoundTripTTLAndOversizedReplyGuard(t *testing.T) {
	origin := os.Getenv("NATIVE_REDIS_FIXTURE_URL")
	if origin == "" {
		t.Skip("Dedicated disposable Redis fixture is not configured")
	}
	u, e := url.Parse(origin)
	if e != nil || u.Scheme != "redis" || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost") {
		t.Fatal("Redis integration requires an owned loopback fixture")
	}
	remote, e := NewRedisRemote(origin, "continua-native-fixture", true)
	if e != nil {
		t.Fatal(e)
	}
	defer remote.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	value := json.RawMessage(`{"lastPrice":30,"volume":null}`)
	if e = remote.Set(ctx, "quote:0:quote:NSE:KCB", value, 100*time.Millisecond); e != nil {
		t.Fatal(e)
	}
	raw, e := remote.Get(ctx, "quote:0:quote:NSE:KCB")
	if e != nil || string(raw) != string(value) {
		t.Fatal("Redis round trip failed", e)
	}
	time.Sleep(150 * time.Millisecond)
	raw, e = remote.Get(ctx, "quote:0:quote:NSE:KCB")
	if e != nil || raw != nil {
		t.Fatal("Redis TTL not enforced", e)
	}
	before, e := remote.Epoch(ctx, "quote")
	if e != nil {
		t.Fatal(e)
	}
	if e = remote.Bump(ctx, "quote"); e != nil {
		t.Fatal(e)
	}
	after, e := remote.Epoch(ctx, "quote")
	if e != nil || after == before {
		t.Fatal("Redis invalidation failed", e)
	}
	if e = remote.client.Set(ctx, remote.key("oversized-fixture"), strings.Repeat("a", 4194305), time.Minute).Err(); e != nil {
		t.Fatal("owned oversized fixture setup failed")
	}
	raw, e = remote.Get(ctx, "oversized-fixture")
	if e != nil || raw != nil {
		t.Fatal("oversized remote reply was not bounded before download", e)
	}
}
