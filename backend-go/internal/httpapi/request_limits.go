package httpapi

import (
	"context"
	"continua/backend/internal/cache"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// The configured Redis/Upstash cache connection supplies atomic counters too.
// Memory mode is supported for a single process, with the existing bounded map.
func (s *Server) admit(ctx context.Context, w http.ResponseWriter, key string, limit int, duration time.Duration) bool {
	if remote, ok := s.ReadCache.(cache.RateCounter); ok {
		counterCtx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
		defer cancel()
		allowed, retry, err := remote.Take(counterCtx, key, limit, duration)
		if err != nil {
			w.Header().Set("Retry-After", "2")
			respond(w, 503, map[string]string{"error": "Request protection is temporarily unavailable. Please retry.", "code": "RATE_LIMIT_STORE_UNAVAILABLE"})
			return false
		}
		if !allowed {
			w.Header().Set("Retry-After", strconv.FormatInt(max(1, int64((retry+time.Second-1)/time.Second)), 10))
			failure(w, 429, "Too many requests. Please retry shortly.")
			return false
		}
		return true
	}
	if !s.limiter.allowWindow(key, limit, time.Now(), duration) {
		w.Header().Set("Retry-After", strconv.FormatInt(max(1, int64((duration+time.Second-1)/time.Second)), 10))
		failure(w, 429, "Too many requests. Please retry shortly.")
		return false
	}
	return true
}

func workloadPolicy(r *http.Request) (string, int) {
	path := r.URL.Path
	switch {
	case transferPath(path):
		return "transfer", 5
	case strings.HasPrefix(path, "/api/v1/billing/"):
		return "billing", 20
	case strings.HasPrefix(path, "/api/v1/engine/"):
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			return "calculation-write", 20
		}
		return "research", 30
	case strings.HasPrefix(path, "/api/v1/research/") || strings.HasPrefix(path, "/api/v1/statistics/") || strings.HasPrefix(path, "/api/v1/price-history/") || strings.HasPrefix(path, "/api/v1/valuation/"):
		return "research", 30
	case r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions:
		return "mutation", 30
	default:
		return "", 0
	}
}

func transferPath(path string) bool {
	for _, segment := range strings.Split(path, "/") {
		if segment == "export" || segment == "import" {
			return true
		}
	}
	return false
}
