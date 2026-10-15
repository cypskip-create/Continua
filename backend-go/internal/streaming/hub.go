// Package streaming retains first-frame authentication and symbol subscriptions.
package streaming

import (
	"context"
	"continua/backend/internal/auth"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"github.com/coder/websocket"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

type Authenticator interface {
	Authenticate(context.Context, http.Header) (*auth.APIKey, error)
}
type Event struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}
type client struct {
	authorized bool
	symbols    map[string]bool
	queue      chan []byte
	cancel     context.CancelFunc
}
type Hub struct {
	mu            sync.Mutex
	clients       map[*client]bool
	last          map[string][32]byte
	slots         chan struct{}
	queuedBytes   int
	Auth          Authenticator
	Context       context.Context
	AllowedOrigin func(string) bool
}

func New(ctx context.Context, a Authenticator) *Hub {
	return &Hub{clients: map[*client]bool{}, last: map[string][32]byte{}, slots: make(chan struct{}, 200), Auth: a, Context: ctx}
}

var symbolPattern = regexp.MustCompile(`^[A-Z0-9.\-]{1,20}$`)

// Producers call only after persistence. Exact repeated payloads are suppressed,
// but a changed event timestamp is still a different publisher observation.
func (h *Hub) Publish(event Event) error {
	if (event.Type != "quote" && event.Type != "corporate_action") || len(event.Payload) > 65536 || !json.Valid(event.Payload) {
		return errors.New("invalid market event")
	}
	var identity struct {
		Symbol     string `json:"symbol"`
		SecurityID string `json:"securityId"`
	}
	if json.Unmarshal(event.Payload, &identity) != nil {
		return errors.New("invalid event identity")
	}
	symbol := strings.ToUpper(identity.Symbol)
	if symbol == "" && strings.HasPrefix(identity.SecurityID, "NSE:") {
		symbol = strings.TrimPrefix(identity.SecurityID, "NSE:")
	}
	if !symbolPattern.MatchString(symbol) {
		return errors.New("event symbol unavailable")
	}
	raw, err := json.Marshal(event)
	if err != nil {
		return err
	}
	sum := sha256.Sum256(raw)
	key := event.Type + ":" + symbol
	h.mu.Lock()
	defer h.mu.Unlock()
	if old, ok := h.last[key]; ok && old == sum {
		return nil
	}
	if len(h.last) < 2000 {
		h.last[key] = sum
	} else if _, ok := h.last[key]; ok {
		h.last[key] = sum
	}
	for c := range h.clients {
		// Never send data to unauthenticated/empty subscriptions or broadcast all
		// issuers merely because the corporate-action shape lacks a symbol field.
		if !c.authorized || !c.symbols[symbol] {
			continue
		}
		h.enqueue(c, raw)
	}
	return nil
}

// Called with the hub mutex held. A process-wide byte budget, not merely a
// per-client message count, bounds worst-case aggregate fanout memory.
func (h *Hub) enqueue(c *client, raw []byte) {
	if len(raw) > 4*1024*1024-h.queuedBytes {
		c.cancel()
		return
	}
	select {
	case c.queue <- raw:
		h.queuedBytes += len(raw)
	default:
		c.cancel()
	}
}
func (h *Hub) consumed(raw []byte) { h.mu.Lock(); h.queuedBytes -= len(raw); h.mu.Unlock() }
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if h.Auth == nil || h.Context == nil {
		http.Error(w, "Stream unavailable", 503)
		return
	}
	if h.AllowedOrigin == nil || !h.AllowedOrigin(r.Header.Get("Origin")) {
		http.Error(w, "Origin not allowed", 403)
		return
	}
	// Secrets belong exclusively in the authentication frame, not access URLs.
	if r.URL.RawQuery != "" {
		http.Error(w, "Stream query parameters are not supported", 400)
		return
	}
	select {
	case h.slots <- struct{}{}:
		defer func() { <-h.slots }()
	default:
		http.Error(w, "Stream capacity reached", 503)
		return
	}
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true, CompressionMode: websocket.CompressionDisabled})
	if err != nil {
		return
	}
	defer conn.CloseNow()
	conn.SetReadLimit(32768)
	ctx, cancel := context.WithCancel(h.Context)
	defer cancel()
	// Request context is not reused after HTTP hijacking. Lifetime and shutdown
	// are bounded by the application context and this explicit session deadline.
	expiry := time.AfterFunc(30*time.Minute, cancel)
	defer expiry.Stop()
	c := &client{symbols: map[string]bool{}, queue: make(chan []byte, 32), cancel: cancel}
	h.mu.Lock()
	h.clients[c] = true
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.clients, c)
		for {
			select {
			case raw := <-c.queue:
				h.queuedBytes -= len(raw)
			default:
				h.mu.Unlock()
				return
			}
		}
	}()
	readCtx, stop := context.WithTimeout(ctx, 5*time.Second)
	kind, raw, err := conn.Read(readCtx)
	stop()
	var first struct{ Action, APIKey string }
	if err != nil || kind != websocket.MessageText || json.Unmarshal(raw, &first) != nil || first.Action != "authenticate" || first.APIKey == "" {
		_ = conn.Close(websocket.StatusPolicyViolation, "Authenticate before subscribing")
		return
	}
	headers := http.Header{}
	headers.Set("X-API-Key", first.APIKey)
	authCtx, stop := context.WithTimeout(ctx, 5*time.Second)
	_, err = h.Auth.Authenticate(authCtx, headers)
	stop()
	headers.Del("X-API-Key")
	first.APIKey = ""
	raw = nil
	if err != nil {
		_ = conn.Close(websocket.StatusPolicyViolation, "Invalid API key")
		return
	}
	writeCtx, stop := context.WithTimeout(ctx, 5*time.Second)
	err = conn.Write(writeCtx, websocket.MessageText, []byte(`{"type":"authenticated"}`))
	stop()
	if err != nil {
		return
	}
	h.mu.Lock()
	c.authorized = true
	h.mu.Unlock()
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		defer cancel()
		for {
			select {
			case <-ctx.Done():
				return
			case raw := <-c.queue:
				h.consumed(raw)
				writeCtx, stop := context.WithTimeout(ctx, 5*time.Second)
				err := conn.Write(writeCtx, websocket.MessageText, raw)
				stop()
				if err != nil {
					return
				}
			}
		}
	}()
	defer func() { cancel(); _ = conn.CloseNow(); <-writerDone }()
	messages := 0
	window := time.Now()
	for {
		kind, raw, err = conn.Read(ctx)
		if err != nil {
			return
		}
		if time.Since(window) >= time.Minute {
			messages = 0
			window = time.Now()
		}
		messages++
		if messages > 120 {
			_ = conn.Close(websocket.StatusPolicyViolation, "Stream message limit")
			return
		}
		var msg struct {
			Action  string   `json:"action"`
			Symbols []string `json:"symbols"`
		}
		if kind != websocket.MessageText || json.Unmarshal(raw, &msg) != nil || len(msg.Symbols) > 1000 || (msg.Action != "subscribe" && msg.Action != "unsubscribe") {
			h.mu.Lock()
			h.enqueue(c, []byte(`{"type":"error","message":"Invalid message — expected JSON { action, symbols }"}`))
			h.mu.Unlock()
			continue
		}
		valid := true
		for i, s := range msg.Symbols {
			msg.Symbols[i] = strings.ToUpper(s)
			if !symbolPattern.MatchString(msg.Symbols[i]) {
				valid = false
			}
		}
		if !valid {
			_ = conn.Close(websocket.StatusPolicyViolation, "Invalid symbols")
			return
		}
		h.mu.Lock()
		for _, symbol := range msg.Symbols {
			if msg.Action == "unsubscribe" {
				delete(c.symbols, symbol)
			} else if len(c.symbols) < 1000 {
				c.symbols[symbol] = true
			} else {
				cancel()
			}
		}
		h.mu.Unlock()
	}
}
