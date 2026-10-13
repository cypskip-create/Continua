package billing

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type transportFunc func(*http.Request) (*http.Response, error)

func (f transportFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestProviderFixedOriginModeAndMethods(t *testing.T) {
	p := NewProvider("sk_live_fixture", "sk_test_fixture")
	calls := 0
	p.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.Scheme != "https" || r.URL.Host != "api.paystack.co" || r.Header.Get("Authorization") != "Bearer sk_test_fixture" {
			t.Fatal("provider secret escaped trusted origin")
		}
		if r.Method != http.MethodPost || r.URL.Path != "/charge" {
			t.Fatal("wrong request")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"status":true,"data":{"reference":"fixture"}}`)), Header: make(http.Header)}, nil
	})
	if _, e := p.Call(context.Background(), "test", "/charge", map[string]string{"email": "fixture@example.test"}); e != nil {
		t.Fatal(e)
	}
	for _, path := range []string{"https://evil.test", "//evil.test", "/charge?secret=x", "/transaction/verify/../charge", "/transaction/verify/forged"} {
		if _, e := p.Call(context.Background(), "test", path, nil); e == nil {
			t.Fatal("unsafe path accepted", path)
		}
	}
	if _, e := p.Call(context.Background(), "invalid", "/charge", map[string]string{}); Status(e) != 503 {
		t.Fatal(e)
	}
	if calls != 1 {
		t.Fatal("unexpected provider requests", calls)
	}
}
func TestProviderRejectsRedirectAndUnexpectedBodiesWithoutLeakingSecrets(t *testing.T) {
	for _, fixture := range []struct {
		status int
		body   string
	}{{302, `sensitive provider message`}, {500, `sk_test_fixture private`}, {200, `{"status":false,"message":"secret"}`}, {200, `{"status":true,"data":null}`}, {200, strings.Repeat("x", 1048577)}, {200, `not json`}} {
		p := NewProvider("", "sk_test_fixture")
		calls := 0
		p.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) {
			calls++
			return &http.Response{StatusCode: fixture.status, Body: io.NopCloser(strings.NewReader(fixture.body)), Header: http.Header{"Location": []string{"https://evil.test"}}}, nil
		})
		_, e := p.Call(context.Background(), "test", "/transaction/verify/"+fixtureRef, nil)
		if Status(e) != 502 || strings.Contains(e.Error(), "sk_test_") || strings.Contains(e.Error(), "sensitive") || calls != 1 {
			t.Fatal("provider rejection/retry/secret failure", e, calls)
		}
	}
}
func TestProviderCancellationDoesNotRetry(t *testing.T) {
	p := NewProvider("", "sk_test_fixture")
	calls := 0
	p.client.Transport = transportFunc(func(r *http.Request) (*http.Response, error) { calls++; return nil, r.Context().Err() })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e := p.Call(ctx, "test", "/charge", map[string]string{}); Status(e) != 502 || calls != 1 {
		t.Fatal("cancel not bounded", e, calls)
	}
}
