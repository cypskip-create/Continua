package httpapi

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net"
	"net/http"
	"time"
)

type RequestSummary struct {
	RequestID string
	Method    string
	Status    int
	Bytes     int64
	Duration  time.Duration
	Panicked  bool
}

// Preserve optional connection interfaces used by the native WebSocket server.
// Log only transport metadata, never URLs, query strings, headers or bodies.
type responseState struct {
	http.ResponseWriter
	status   int
	bytes    int64
	hijacked net.Conn
}

func (w *responseState) Unwrap() http.ResponseWriter { return w.ResponseWriter }
func (w *responseState) WriteHeader(status int) {
	if w.status != 0 {
		return
	}
	if status >= 100 && status < 200 && status != http.StatusSwitchingProtocols {
		w.ResponseWriter.WriteHeader(status)
		return
	}
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}
func (w *responseState) Write(body []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	n, err := w.ResponseWriter.Write(body)
	w.bytes += int64(n)
	return n, err
}
func (w *responseState) Flush() {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
func (w *responseState) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h, ok := w.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("connection upgrade unsupported")
	}
	conn, buffer, err := h.Hijack()
	if err == nil {
		w.hijacked = conn
		if w.status == 0 {
			w.status = http.StatusSwitchingProtocols
		}
	}
	return conn, buffer, err
}
func (w *responseState) Push(target string, options *http.PushOptions) error {
	if p, ok := w.ResponseWriter.(http.Pusher); ok {
		return p.Push(target, options)
	}
	return http.ErrNotSupported
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	state := &responseState{ResponseWriter: w}
	summary := RequestSummary{Method: r.Method}
	defer func() {
		if recover() != nil {
			summary.Panicked = true
			if state.hijacked != nil {
				_ = state.hijacked.Close()
			} else if state.status == 0 {
				failure(state, 500, "Internal server error")
			}
		}
		if state.status == 0 {
			state.status = http.StatusOK
		}
		summary.Status = state.status
		summary.Bytes = state.bytes
		summary.Duration = time.Since(start)
		if s.RequestLog != nil {
			func() { defer func() { _ = recover() }(); s.RequestLog(summary) }()
		}
	}()
	var id [12]byte
	if _, err := rand.Read(id[:]); err != nil {
		failure(state, 503, "Request initialization unavailable")
		return
	}
	summary.RequestID = hex.EncodeToString(id[:])
	state.Header().Set("X-Request-ID", summary.RequestID)
	s.serveHTTP(state, r)
}
