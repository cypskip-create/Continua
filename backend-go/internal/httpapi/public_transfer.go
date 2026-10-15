package httpapi

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
)

var publicDataPath = regexp.MustCompile(`^/api/v1/(quotes(/[A-Za-z0-9.-]{1,20})?|indices|instruments|sectors)$`)

type PublicTransfer struct {
	Next                                 http.Handler
	slots                                chan struct{}
	plain, sent, compressed, notModified atomic.Uint64
}

func NewPublicTransfer(next http.Handler) *PublicTransfer {
	return &PublicTransfer{Next: next, slots: make(chan struct{}, 4)}
}
func (h *PublicTransfer) Stats() map[string]uint64 {
	return map[string]uint64{"publicPayloadBytes": h.plain.Load(), "publicResponseBytes": h.sent.Load(), "compressedResponses": h.compressed.Load(), "notModifiedResponses": h.notModified.Load()}
}

type boundedResponse struct {
	http.ResponseWriter
	body        bytes.Buffer
	status      int
	passthrough bool
}

func (w *boundedResponse) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
}
func (w *boundedResponse) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.status = 200
	}
	if !w.passthrough && w.body.Len()+len(data) <= 256*1024 {
		return w.body.Write(data)
	}
	if !w.passthrough {
		w.passthrough = true
		w.ResponseWriter.WriteHeader(w.status)
		if _, err := w.ResponseWriter.Write(w.body.Bytes()); err != nil {
			return 0, err
		}
		w.body.Reset()
	}
	return w.ResponseWriter.Write(data)
}
func acceptsGzip(header string) bool {
	explicit, quality := false, 0.0
	wildcard := 0.0
	for _, part := range strings.Split(header, ",") {
		fields := strings.Split(part, ";")
		name := strings.ToLower(strings.TrimSpace(fields[0]))
		if name != "gzip" && name != "*" {
			continue
		}
		q := 1.0
		for _, field := range fields[1:] {
			k, v, ok := strings.Cut(strings.TrimSpace(field), "=")
			if ok && strings.EqualFold(k, "q") {
				parsed, err := strconv.ParseFloat(v, 64)
				if err != nil || !(parsed >= 0 && parsed <= 1) {
					q = 0
				} else {
					q = parsed
				}
			}
		}
		if name == "gzip" {
			explicit = true
			quality = q
		} else {
			wildcard = q
		}
	}
	if explicit {
		return quality > 0
	}
	return wildcard > 0
}
func etagMatches(header, tag string) bool {
	if len(header) > 1024 {
		return false
	}
	for _, candidate := range strings.Split(header, ",") {
		value := strings.TrimSpace(candidate)
		if value == "*" || strings.TrimPrefix(value, "W/") == strings.TrimPrefix(tag, "W/") {
			return true
		}
	}
	return false
}
func (h *PublicTransfer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	eligible := r.Method == http.MethodGet && publicDataPath.MatchString(r.URL.Path) && !strings.EqualFold(r.Header.Get("Upgrade"), "websocket")
	for _, name := range []string{"Authorization", "Cookie", "X-User-Token", "X-Supabase-Key"} {
		if r.Header.Get(name) != "" {
			eligible = false
		}
	}
	if !eligible {
		h.Next.ServeHTTP(w, r)
		return
	}
	select {
	case h.slots <- struct{}{}:
		defer func() { <-h.slots }()
	default:
		h.Next.ServeHTTP(w, r)
		return
	}
	capture := &boundedResponse{ResponseWriter: w}
	// Always execute authentication and rate limiting before considering ETags.
	// No response cache or shortcut can replay data to a revoked API key.
	h.Next.ServeHTTP(capture, r)
	if capture.passthrough {
		return
	}
	if capture.status == 0 {
		capture.status = 200
	}
	raw := capture.body.Bytes()
	payload := raw
	public := capture.status == 200 && strings.HasPrefix(w.Header().Get("Content-Type"), "application/json") && w.Header().Get("Content-Encoding") == "" && w.Header().Get("Set-Cookie") == "" && json.Valid(raw)
	if public {
		h.plain.Add(uint64(len(raw)))
		digest := sha256.Sum256(raw)
		tag := `W/"` + hex.EncodeToString(digest[:]) + `"`
		w.Header().Set("ETag", tag)
		w.Header().Add("Vary", "Accept-Encoding")
		if etagMatches(r.Header.Get("If-None-Match"), tag) {
			w.Header().Del("Content-Length")
			w.WriteHeader(http.StatusNotModified)
			h.notModified.Add(1)
			return
		}
		if len(raw) >= 1024 && acceptsGzip(r.Header.Get("Accept-Encoding")) {
			var encoded bytes.Buffer
			writer, _ := gzip.NewWriterLevel(&encoded, gzip.BestSpeed)
			_, err := writer.Write(raw)
			closed := writer.Close()
			if err == nil && closed == nil && encoded.Len() < len(raw) {
				payload = encoded.Bytes()
				w.Header().Set("Content-Encoding", "gzip")
				h.compressed.Add(1)
			}
		}
		w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
	}
	w.WriteHeader(capture.status)
	n, _ := w.Write(payload)
	if public {
		h.sent.Add(uint64(n))
	}
}
