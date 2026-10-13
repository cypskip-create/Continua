package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type fixtureStore struct {
	symbols []string
	calls   int
	data    []json.RawMessage
}

func (f *fixtureStore) FindActiveKey(context.Context, string) (*auth.APIKey, error) {
	return &auth.APIKey{ID: "fixture", Active: true, RateLimitPerMin: 120}, nil
}
func (f *fixtureStore) TouchKey(context.Context, string) error { return nil }
func (f *fixtureStore) Ping(context.Context) error             { return nil }
func (f *fixtureStore) Quotes(_ context.Context, _ string, symbols []string) ([]json.RawMessage, error) {
	f.calls++
	f.symbols = symbols
	return f.data, nil
}
func (f *fixtureStore) Sectors(context.Context) ([]json.RawMessage, error) {
	return []json.RawMessage{json.RawMessage(`{"id":"banking","name":"Banking"}`)}, nil
}
func (f *fixtureStore) Instruments(context.Context, string) ([]json.RawMessage, error) {
	return []json.RawMessage{json.RawMessage(`{"symbol":"KPC","securityId":"NSE:KPC","companyName":"Kenya Pipeline Company","sector":null,"currency":"KES","status":"active","isin":null}`)}, nil
}
func fixtureServer() (*Server, *fixtureStore) {
	f := &fixtureStore{}
	a := auth.New(f, false)
	a.DevelopmentKey = "fixture-dev"
	return New(f, a), f
}
func request(s *Server, path, key string) *httptest.ResponseRecorder {
	r := httptest.NewRequest("GET", path, nil)
	if key != "" {
		r.Header.Set("X-API-Key", key)
	}
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	return w
}
func TestLivenessIsOpenButIncompleteReadinessCannotPass(t *testing.T) {
	s, f := fixtureServer()
	if w := request(s, "/api/v1/health/live", ""); w.Code != 200 {
		t.Fatal(w.Code)
	}
	if w := request(s, "/api/v1/health", ""); w.Code != 503 {
		t.Fatal("unsafe production readiness", w.Code)
	}
	if f.calls != 0 {
		t.Fatal("health made data request")
	}
}
func TestQuotesRequireAuthAndNormalizeSymbols(t *testing.T) {
	s, f := fixtureServer()
	if w := request(s, "/api/v1/quotes?symbols=scom", ""); w.Code != 401 {
		t.Fatal(w.Code)
	}
	w := request(s, "/api/v1/quotes?symbols=scom,%20kcb,,", "fixture-dev")
	if w.Code != 200 || len(f.symbols) != 2 || f.symbols[0] != "SCOM" || f.symbols[1] != "KCB" {
		t.Fatal(w.Code, f.symbols)
	}
	if strings.TrimSpace(w.Body.String()) != `{"data":[]}` {
		t.Fatal("empty history fabricated", w.Body.String())
	}
}
func TestSingleQuoteRetainsNullsAndWireNames(t *testing.T) {
	s, f := fixtureServer()
	f.data = []json.RawMessage{json.RawMessage(`{"securityId":"fixture","symbol":"SCOM","lastPrice":30,"bid":null,"timestamp":"2026-10-12T12:00:00.000Z"}`)}
	w := request(s, "/api/v1/quotes/scom", "fixture-dev")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"bid":null`) {
		t.Fatal(w.Body.String())
	}
}
func TestUnknownQuoteIs404AndUnsupportedPortIsNotFakeSuccess(t *testing.T) {
	s, _ := fixtureServer()
	if w := request(s, "/api/v1/quotes/UNKNOWN", "fixture-dev"); w.Code != 404 {
		t.Fatal(w.Code)
	}
	if w := request(s, "/api/v1/unmigrated-feature", "fixture-dev"); w.Code != 501 {
		t.Fatal("unimplemented Engine falsely available", w.Code)
	}
}
func TestBatchRequiresSymbolsAndKnownExchange(t *testing.T) {
	s, f := fixtureServer()
	for _, path := range []string{"/api/v1/quotes", "/api/v1/quotes?symbols=SCOM&exchange=FORGED"} {
		if w := request(s, path, "fixture-dev"); w.Code != 400 {
			t.Fatal(path, w.Code)
		}
	}
	if f.calls != 0 {
		t.Fatal("invalid query reached DB")
	}
}
func TestCorsOnlyAllowsProjectAliasesAndConfiguredOrigins(t *testing.T) {
	if AllowedOrigin("https://attacker.vercel.app", nil) || AllowedOrigin("https://continua-cypskip-creates-projects.vercel.app.attacker.example", nil) {
		t.Fatal("wildcard CORS")
	}
	if !AllowedOrigin("https://continua-abc-cypskip-creates-projects.vercel.app", nil) || !AllowedOrigin("https://owned.example", map[string]bool{"https://owned.example": true}) {
		t.Fatal("project CORS")
	}
	s, _ := fixtureServer()
	r := httptest.NewRequest("OPTIONS", "/api/v1/quotes", nil)
	r.Header.Set("Origin", "https://attacker.example")
	w := httptest.NewRecorder()
	s.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal(w.Code)
	}
}
func TestLimiterExpiresAndHasFiniteIdentityBudget(t *testing.T) {
	l := NewLimiter()
	now := time.Now()
	if !l.Allow("fixture", 1, now) || l.Allow("fixture", 1, now) || !l.Allow("fixture", 1, now.Add(time.Minute)) {
		t.Fatal("rate window broken")
	}
	for i := 0; i < 10000; i++ {
		l.windows[strings.Repeat("x", i%20)+time.Unix(int64(i), 0).String()] = window{expires: now.Add(time.Minute)}
	}
	if l.Allow("new-identity", 1, now) {
		t.Fatal("unbounded limiter allocation")
	}
}

func TestIPv6IdentityCanonicalization(t *testing.T) {
	if canonicalIP("2001:db8:1234:5600::1") != canonicalIP("2001:db8:1234:56ff::9") {
		t.Fatal("IPv6 /56 limit can be bypassed")
	}
	if canonicalIP("::ffff:192.0.2.1") != "192.0.2.1" {
		t.Fatal("mapped IPv4 identity changed")
	}
}
func TestInstrumentUniverseIsDatabaseDrivenAndRetainsNulls(t *testing.T) {
	s, _ := fixtureServer()
	w := request(s, "/api/v1/instruments", "fixture-dev")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"symbol":"KPC"`) || !strings.Contains(w.Body.String(), `"sector":null`) {
		t.Fatal(w.Body.String())
	}
}
