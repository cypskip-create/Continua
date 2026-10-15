package ingestion

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNativeCollectorCannotForwardToNodeOrFollowRedirect(t *testing.T) {
	for _, mode := range []string{"node", "redirect", "python"} {
		refreshes := 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/health/live" {
				if mode == "redirect" {
					http.Redirect(w, r, "/other", 302)
					return
				}
				if mode == "node" {
					w.Write([]byte(`{"status":"alive","implementation":"node","runtime":"node"}`))
					return
				}
				w.Write([]byte(`{"status":"alive","implementation":"python","runtime":"python"}`))
				return
			}
			if r.URL.Path == "/indices/refresh" && r.Method == "POST" {
				refreshes++
				w.Write([]byte(`{"status":"checked"}`))
				return
			}
			w.WriteHeader(404)
		}))
		client, e := NewCollectorClient(server.URL, true)
		if e != nil {
			t.Fatal(e)
		}
		e = client.Refresh(context.Background(), "indices")
		client.Close()
		server.Close()
		if mode == "python" {
			if e != nil || refreshes != 1 {
				t.Fatal(mode, e, refreshes)
			}
		} else if e == nil || refreshes != 0 {
			t.Fatal("legacy collector or redirect invoked", mode, e, refreshes)
		}
	}
}
func TestCollectorOriginAndEndpointAreNotCallerControlled(t *testing.T) {
	for _, origin := range []string{"http://example.com", "https://user:secret@example.com", "https://example.com/path", "https://example.com?token=secret", "https://example.com#fragment"} {
		if _, e := NewCollectorClient(origin, false); e == nil {
			t.Fatal("unsafe origin", origin)
		}
	}
	client, e := NewCollectorClient("https://collector.example", false)
	if e != nil {
		t.Fatal(e)
	}
	defer client.Close()
	if client.Refresh(context.Background(), "../../billing") == nil {
		t.Fatal("unbounded collector endpoint")
	}
}
