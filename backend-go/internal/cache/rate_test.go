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

func TestRateCounterUsesAtomicScriptAndHashesPrivateIdentity(t *testing.T) {
	remote, err := NewUpstashRemote("https://fixture.upstash.io", "fixture-token", "continua-fixture")
	if err != nil {
		t.Fatal(err)
	}
	for _, response := range []struct {
		body    string
		allowed bool
		fails   bool
	}{
		{`{"result":[1,59000]}`, true, false},
		{`{"result":[0,58000]}`, false, false},
		{`{"result":[2,0]}`, false, true},
		{`{"error":"dependency unavailable"}`, false, true},
	} {
		remote.client.Transport = fixtureTransport(func(r *http.Request) (*http.Response, error) {
			raw, _ := io.ReadAll(r.Body)
			var parts []any
			if json.Unmarshal(raw, &parts) != nil || len(parts) != 6 || parts[0] != "EVAL" || parts[2] != float64(1) || parts[4] != float64(3) || parts[5] != float64(60000) {
				t.Fatal("invalid atomic counter command")
			}
			if strings.Contains(string(raw), "private-user") || !strings.HasPrefix(parts[3].(string), "continua-fixture:rate:") {
				t.Fatal("raw identity leaked")
			}
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(response.body)), Header: make(http.Header)}, nil
		})
		allowed, retry, err := remote.Take(context.Background(), "private-user:private-resource", 3, time.Minute)
		if (err != nil) != response.fails || allowed != response.allowed || (!response.fails && retry <= 0) {
			t.Fatal(allowed, retry, err)
		}
	}
	for _, limit := range []int{0, 100001} {
		if _, _, err = remote.Take(context.Background(), "fixture", limit, time.Minute); err == nil {
			t.Fatal("invalid policy accepted")
		}
	}
}
