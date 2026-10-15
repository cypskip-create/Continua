package streaming

import (
	"context"
	"continua/backend/internal/auth"
	"encoding/json"
	"errors"
	"github.com/coder/websocket"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type keyFixture struct{}

func (keyFixture) Authenticate(_ context.Context, h http.Header) (*auth.APIKey, error) {
	if h.Get("X-API-Key") != "fixture" {
		return nil, errors.New("invalid")
	}
	return &auth.APIKey{ID: "fixture", Active: true}, nil
}
func TestFanoutIsAuthorizedScopedBoundedAndDeduplicated(t *testing.T) {
	h := New(context.Background(), keyFixture{})
	cancelled := false
	subscribed := &client{authorized: true, symbols: map[string]bool{"KCB": true}, queue: make(chan []byte, 1), cancel: func() { cancelled = true }}
	unauthorized := &client{symbols: map[string]bool{"KCB": true}, queue: make(chan []byte, 1), cancel: func() {}}
	empty := &client{authorized: true, symbols: map[string]bool{}, queue: make(chan []byte, 1), cancel: func() {}}
	h.clients[subscribed] = true
	h.clients[unauthorized] = true
	h.clients[empty] = true
	event := Event{Type: "quote", Payload: json.RawMessage(`{"symbol":"KCB","lastPrice":30}`)}
	if err := h.Publish(event); err != nil {
		t.Fatal(err)
	}
	if len(subscribed.queue) != 1 || len(unauthorized.queue) != 0 || len(empty.queue) != 0 {
		t.Fatal("unscoped data leak")
	}
	if err := h.Publish(event); err != nil || cancelled {
		t.Fatal(err, cancelled)
	}
	event.Payload = json.RawMessage(`{"symbol":"KCB","lastPrice":31}`)
	_ = h.Publish(event)
	if !cancelled {
		t.Fatal("slow client not bounded")
	}
	if err := h.Publish(Event{Type: "quote", Payload: json.RawMessage(`{"symbol":"OTHER"}`)}); err != nil {
		t.Fatal(err)
	}
	if err := h.Publish(Event{Type: "corporate_action", Payload: json.RawMessage(`{"id":"a1"}`)}); err == nil {
		t.Fatal("identityless event broadcast")
	}
}
func TestRealSocketFirstFrameAuthenticationAndAppShutdown(t *testing.T) {
	root, cancel := context.WithCancel(context.Background())
	defer cancel()
	h := New(root, keyFixture{})
	h.AllowedOrigin = func(origin string) bool { return origin == "" }
	server := httptest.NewServer(h)
	defer server.Close()
	ctx, stop := context.WithTimeout(context.Background(), 5*time.Second)
	defer stop()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"action":"authenticate","apiKey":"fixture"}`)); err != nil {
		t.Fatal(err)
	}
	_, raw, err := conn.Read(ctx)
	if err != nil || string(raw) != `{"type":"authenticated"}` {
		t.Fatal(string(raw), err)
	}
	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"action":"subscribe","symbols":["kcb"]}`)); err != nil {
		t.Fatal(err)
	}
	// Await the server's subscription state, not an arbitrary sleep.
	deadline := time.Now().Add(time.Second)
	for {
		h.mu.Lock()
		ready := false
		for c := range h.clients {
			ready = c.symbols["KCB"]
		}
		h.mu.Unlock()
		if ready {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("subscription timeout")
		}
		time.Sleep(time.Millisecond)
	}
	_ = h.Publish(Event{Type: "quote", Payload: json.RawMessage(`{"symbol":"KCB","lastPrice":30}`)})
	_, raw, err = conn.Read(ctx)
	if err != nil || !strings.Contains(string(raw), `"type":"quote"`) {
		t.Fatal(string(raw), err)
	}
	cancel()
	_, _, err = conn.Read(ctx)
	if err == nil {
		t.Fatal("shutdown did not close connection")
	}
}
func TestSocketRejectsCredentialURLsAndForeignOrigins(t *testing.T) {
	h := New(context.Background(), keyFixture{})
	h.AllowedOrigin = func(origin string) bool { return origin == "" }
	for _, item := range []struct {
		URL, Origin string
		Code        int
	}{{"http://fixture/?apiKey=secret", "", 400}, {"http://fixture/", "https://untrusted.example", 403}} {
		r := httptest.NewRequest("GET", item.URL, nil)
		r.Header.Set("Origin", item.Origin)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != item.Code {
			t.Fatal(w.Code)
		}
	}
}
func TestAggregateFanoutBytesAreBounded(t *testing.T) {
	h := New(context.Background(), keyFixture{})
	cancelled := false
	c := &client{queue: make(chan []byte, 32), cancel: func() { cancelled = true }}
	h.mu.Lock()
	h.enqueue(c, make([]byte, 4*1024*1024))
	h.enqueue(c, []byte("extra"))
	h.mu.Unlock()
	if !cancelled || h.queuedBytes != 4*1024*1024 || len(c.queue) != 1 {
		t.Fatal(cancelled, h.queuedBytes, len(c.queue))
	}
	h.consumed(<-c.queue)
	if h.queuedBytes != 0 {
		t.Fatal(h.queuedBytes)
	}
}
