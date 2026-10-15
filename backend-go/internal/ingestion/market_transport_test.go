package ingestion

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMarketTransportUsesDedicatedKeyAndBoundedQuoteChunks(t *testing.T) {
	key := strings.Repeat("m", 32)
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/internal/nse/read" || r.Header.Get("X-Collector-Market-Key") != key || r.Header.Get("X-Scraper-Admin-Key") != "" {
			t.Error("source transport credential boundary changed")
			w.WriteHeader(401)
			return
		}
		var body struct {
			SourceID  string   `json:"sourceId"`
			Operation string   `json:"operation"`
			Symbols   []string `json:"symbols"`
		}
		if json.NewDecoder(r.Body).Decode(&body) != nil || body.SourceID != "fixture" || body.Operation != "quotes" || len(body.Symbols) > 10 {
			t.Error("invalid source chunk")
			w.WriteHeader(400)
			return
		}
		calls++
		rows := []map[string]string{}
		for _, symbol := range body.Symbols {
			rows = append(rows, map[string]string{"Symbol": symbol})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"implementation": "python", "runtime": "python", "data": rows})
	}))
	defer server.Close()
	transport, err := NewMarketTransport(server.URL, "fixture", key, true)
	if err != nil {
		t.Fatal(err)
	}
	defer transport.Close()
	symbols := []string{}
	for i := 0; i < 25; i++ {
		symbols = append(symbols, fmt.Sprintf("FIX%d", i))
	}
	rows, err := transport.Quotes(context.Background(), symbols)
	if err != nil || len(rows) != 25 || calls != 3 {
		t.Fatal("source chunking failed", err, len(rows), calls)
	}
}

func TestMarketTransportRejectsCompatibilityRuntimeAndRedirects(t *testing.T) {
	for _, mode := range []string{"node", "redirect"} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if mode == "redirect" {
				http.Redirect(w, r, "/elsewhere", 302)
				return
			}
			_, _ = w.Write([]byte(`{"implementation":"node","runtime":"node","data":[]}`))
		}))
		transport, err := NewMarketTransport(server.URL, "fixture", strings.Repeat("m", 32), true)
		if err != nil {
			server.Close()
			t.Fatal(err)
		}
		_, err = transport.Securities(context.Background())
		transport.Close()
		server.Close()
		if err == nil {
			t.Fatal("compatibility transport or redirect accepted")
		}
	}
}
