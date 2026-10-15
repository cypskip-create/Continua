package httpapi

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPublicCompressionPreservesExactJSONAndReducesPayload(t *testing.T) {
	raw := []byte(`{"data":"` + strings.Repeat("observed sourced market values ", 1000) + `"}`)
	h := NewPublicTransfer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(raw)
	}))
	r := httptest.NewRequest("GET", "/api/v1/quotes?symbols=KCB", nil)
	r.Header.Set("Accept-Encoding", "gzip, br")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Header().Get("Content-Encoding") != "gzip" || w.Body.Len() >= len(raw) {
		t.Fatal(w.Header(), w.Body.Len())
	}
	reader, err := gzip.NewReader(bytes.NewReader(w.Body.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := io.ReadAll(reader)
	reader.Close()
	if err != nil || !bytes.Equal(decoded, raw) {
		t.Fatal("source JSON changed", err)
	}
	if h.Stats()["publicResponseBytes"] >= h.Stats()["publicPayloadBytes"] {
		t.Fatal(h.Stats())
	}
}
func TestConditionalPublicReadsAuthenticateBeforeReturning304(t *testing.T) {
	calls := 0
	h := NewPublicTransfer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		if r.Header.Get("X-API-Key") != "fixture" {
			w.WriteHeader(401)
			_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
			return
		}
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	r := httptest.NewRequest("GET", "/api/v1/indices", nil)
	r.Header.Set("X-API-Key", "fixture")
	first := httptest.NewRecorder()
	h.ServeHTTP(first, r)
	tag := first.Header().Get("ETag")
	r.Header.Set("If-None-Match", tag)
	second := httptest.NewRecorder()
	h.ServeHTTP(second, r)
	if second.Code != 304 || second.Body.Len() != 0 || calls != 2 {
		t.Fatal(second.Code, calls)
	}
	r.Header.Set("X-API-Key", "revoked")
	third := httptest.NewRecorder()
	h.ServeHTTP(third, r)
	if third.Code != 401 || calls != 3 || third.Header().Get("ETag") != "" {
		t.Fatal(third.Code, calls)
	}
}
func TestPersonalPaymentsAndOversizedResponsesBypassTransformation(t *testing.T) {
	raw := []byte(`{"data":"` + strings.Repeat("x", 270000) + `"}`)
	h := NewPublicTransfer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(raw)
	}))
	for _, path := range []string{"/api/v1/quotes", "/api/v1/billing/verify/ref", "/api/v1/engine/portfolio/overview"} {
		r := httptest.NewRequest("GET", path, nil)
		r.Header.Set("Accept-Encoding", "gzip")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if !bytes.Equal(w.Body.Bytes(), raw) || w.Header().Get("Content-Encoding") != "" || w.Header().Get("ETag") != "" {
			t.Fatal(path)
		}
	}
}
func TestGzipQualityZeroAndInvalidQualityAreRespected(t *testing.T) {
	for _, header := range []string{"gzip;q=0, *;q=1", "gzip;q=NaN", "gzip;q=2", "br", "gzip;q=invalid"} {
		if acceptsGzip(header) {
			t.Fatal(header)
		}
	}
	if !acceptsGzip("br, gzip;q=0.5") {
		t.Fatal("valid gzip refused")
	}
}
