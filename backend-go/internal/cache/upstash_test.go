package cache

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type fixtureTransport func(*http.Request) (*http.Response, error)

func (f fixtureTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestUpstashUsesServerOnlyBearerJSONPXAndValidatedResponse(t *testing.T) {
	remote, e := NewUpstashRemote("https://fixture.upstash.io", "fixture-token", "continua-preview")
	if e != nil {
		t.Fatal(e)
	}
	defer remote.Close()
	remote.client.Transport = fixtureTransport(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Authorization") != "Bearer fixture-token" || r.URL.RawQuery != "" || r.URL.Host != "fixture.upstash.io" {
			t.Fatal("secret destination changed")
		}
		raw, _ := io.ReadAll(r.Body)
		var parts []any
		if json.Unmarshal(raw, &parts) != nil || parts[0] != "SET" || parts[1] != "continua-preview:indices:0:indices:NSE" || parts[3] != "PX" || parts[4] != 1001.0 {
			t.Fatal(string(raw))
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"result":"OK"}`)), Header: make(http.Header)}, nil
	})
	if e := remote.Set(context.Background(), "indices:0:indices:NSE", json.RawMessage(`[]`), 1001*time.Millisecond); e != nil {
		t.Fatal(e)
	}
}
func TestRemoteConfigurationRejectsSecretDestinationsAndUnprotectedRedis(t *testing.T) {
	for _, origin := range []string{"https://upstash.io.attacker.test", "https://user:password@fixture.upstash.io", "http://fixture.upstash.io", "https://fixture.upstash.io/path", "https://fixture.upstash.io?token=x"} {
		if _, e := NewUpstashRemote(origin, "fixture-token", "continua"); e == nil {
			t.Fatal("unsafe remote destination", origin)
		}
	}
	if _, e := NewRedisRemote("redis://redis.example:6379", "continua", false); e == nil {
		t.Fatal("plaintext external Redis permitted")
	}
	if _, e := NewRedisRemote("rediss://redis.example:6379?max_retries=99", "continua", false); e == nil {
		t.Fatal("unbounded configured retries permitted")
	}
	client, close, e := FromEnvironment(func(string) string { return "" }, false)
	if e != nil {
		t.Fatal(e)
	}
	defer close()
	if _, ok := client.(*Memory); !ok {
		t.Fatal("default cache enables remote service")
	}
}
