package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type panicQuoteStore struct{ MarketStore }

func (panicQuoteStore) Quotes(context.Context, string, []string) ([]json.RawMessage, error) {
	panic("private-fixture-detail-must-not-leak")
}

func TestNativeRequestRuntimeRecoversAndCorrelatesWithoutPrivateErrors(t *testing.T) {
	server, _ := fixtureServer()
	server.Store = panicQuoteStore{server.Store}
	var summary RequestSummary
	server.RequestLog = func(value RequestSummary) { summary = value }
	request := httptest.NewRequest(http.MethodGet, "/api/v1/quotes?symbols=KCB", nil)
	request.Header.Set("X-API-Key", "fixture-dev")
	request.Header.Set("X-Request-ID", "caller-forged-id")
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != 500 || !summary.Panicked || summary.Status != 500 || strings.Contains(response.Body.String(), "private-fixture") {
		t.Fatal("unsafe panic recovery", response.Code, response.Body.String())
	}
	if len(summary.RequestID) != 24 || response.Header().Get("X-Request-ID") != summary.RequestID || summary.Bytes == 0 {
		t.Fatal("request correlation missing")
	}
}

func TestRequestObserverCannotBreakAResponse(t *testing.T) {
	server := New(nil, nil)
	server.RequestLog = func(RequestSummary) { panic("private observer error") }
	response := httptest.NewRecorder()
	server.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/health/live", nil))
	if response.Code != 200 {
		t.Fatal("observer broke liveness")
	}
}

func TestForwardedIdentityRequiresSeparateOwnedEdgeSecret(t *testing.T) {
	server := New(nil, nil)
	server.EdgeOriginSecret = strings.Repeat("s", 32)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/quotes", nil)
	request.RemoteAddr = "192.0.2.1:12345"
	request.Header.Set("X-Forwarded-For", "203.0.113.9")
	request.Header.Set("X-Continua-Client-IP", "203.0.113.8")
	if server.clientIdentity(request) != "192.0.2.1" {
		t.Fatal("untrusted forwarded IP bypassed limiter")
	}
	request.Header.Set("X-Continua-Edge-Secret", strings.Repeat("x", 32))
	if server.clientIdentity(request) != "192.0.2.1" {
		t.Fatal("wrong edge secret trusted")
	}
	request.Header.Set("X-Continua-Edge-Secret", server.EdgeOriginSecret)
	if server.clientIdentity(request) != "203.0.113.8" {
		t.Fatal("owned edge identity unavailable")
	}
	request.Header.Set("X-Continua-Client-IP", "not-an-address")
	if server.clientIdentity(request) != "192.0.2.1" {
		t.Fatal("invalid edge IP not rejected")
	}
}
