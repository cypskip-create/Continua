// Native candidate API. Unsupported routes are explicit; never forwards to Node.
package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/netip"
	"regexp"
	"strings"
	"sync"
	"time"
)

type MarketStore interface {
	Quotes(context.Context, string, []string) ([]json.RawMessage, error)
	Sectors(context.Context) ([]json.RawMessage, error)
	Instruments(context.Context, string) ([]json.RawMessage, error)
	Ping(context.Context) error
}
type Server struct {
	Store    MarketStore
	Auth     *auth.Authenticator
	Users    *auth.UserVerifier
	Origins  map[string]bool
	Revision string
	limiter  *Limiter
}

func New(store MarketStore, authenticator *auth.Authenticator) *Server {
	return &Server{Store: store, Auth: authenticator, Origins: map[string]bool{}, limiter: NewLimiter(), Revision: "native-rewrite-incomplete"}
}

var previewOrigin = regexp.MustCompile(`^https://continua(-[a-z0-9-]+)?-cypskip-creates-projects\.vercel\.app$`)
var fixedOrigins = map[string]bool{"https://continua-delta.vercel.app": true, "https://continua-cypskip-creates-projects.vercel.app": true, "http://localhost:8080": true, "http://127.0.0.1:8080": true, "http://localhost:5173": true, "http://127.0.0.1:5173": true, "http://localhost:5191": true, "http://127.0.0.1:5191": true}

func AllowedOrigin(origin string, configured map[string]bool) bool {
	return origin == "" || fixedOrigins[origin] || configured[origin] || previewOrigin.MatchString(origin)
}
func respond(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
func failure(w http.ResponseWriter, status int, message string) {
	respond(w, status, map[string]string{"error": message})
}
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Referrer-Policy", "no-referrer")
	origin := r.Header.Get("Origin")
	if !AllowedOrigin(origin, s.Origins) {
		failure(w, 403, "Not allowed by CORS")
		return
	}
	if origin != "" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Add("Vary", "Origin")
	}
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type,X-API-Key,X-User-Token,X-Supabase-Key,X-Admin-Key")
		w.WriteHeader(204)
		return
	}
	if r.Method == http.MethodGet && r.URL.Path == "/api/v1/health/live" {
		respond(w, 200, map[string]any{"status": "alive", "revision": s.Revision, "implementation": "go", "timestamp": time.Now().UTC().Format(time.RFC3339Nano)})
		return
	}
	if r.Method == http.MethodGet && r.URL.Path == "/api/v1/health" {
		failure(w, 503, "Native migration incomplete: production cutover is blocked.")
		return
	}
	if !strings.HasPrefix(r.URL.Path, "/api/v1/") {
		failure(w, 404, "Not found")
		return
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	// Candidate does not trust arbitrary forwarded client identity.
	if !s.limiter.Allow("ip:"+canonicalIP(host), 120, time.Now()) {
		w.Header().Set("Retry-After", "60")
		failure(w, 429, "Too many requests. Please retry shortly.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	key, err := s.Auth.Authenticate(ctx, r.Header)
	if err != nil {
		status := 503
		message := "Unable to verify access. Please retry."
		if errors.Is(err, auth.ErrMissing) || errors.Is(err, auth.ErrInvalid) {
			status = 401
			message = err.Error()
		}
		failure(w, status, message)
		return
	}
	var identity *auth.Identity
	accountRoute := strings.HasPrefix(r.URL.Path, "/api/v1/engine/") || strings.HasPrefix(r.URL.Path, "/api/v1/billing/")
	if accountRoute {
		if s.Users == nil {
			failure(w, 503, "Native account verification is not configured.")
			return
		}
		identity, err = s.Users.Verify(ctx, r.Header)
		if err != nil {
			failure(w, auth.AccessStatus(err), err.Error())
			return
		}
	}
	limitIdentity := "key:"
	if key != nil {
		limitIdentity += key.ID
	} else {
		limitIdentity += "public"
	}
	if identity != nil {
		limitIdentity += ":" + identity.UserID
	} else {
		limitIdentity += ":" + canonicalIP(host)
	}
	if key != nil && !s.limiter.Allow(limitIdentity, key.RateLimitPerMin, time.Now()) {
		w.Header().Set("Retry-After", "60")
		failure(w, 429, "Too many requests. Please retry shortly.")
		return
	}
	if r.Method != http.MethodGet {
		failure(w, 501, "This operation has not yet been migrated to the native backend.")
		return
	}
	exchange := r.URL.Query().Get("exchange")
	if exchange == "" {
		exchange = "NSE"
	}
	if exchange != "NSE" {
		failure(w, 400, "Invalid exchange")
		return
	}
	switch {
	case strings.HasPrefix(r.URL.Path, "/api/v1/engine/research-access/"):
		if symbol := strings.TrimPrefix(r.URL.Path, "/api/v1/engine/research-access/"); symbol == "" || strings.Contains(symbol, "/") {
			failure(w, 404, "Not found")
			return
		}
		if err := auth.RequirePremium(identity); err != nil {
			failure(w, auth.AccessStatus(err), err.Error())
			return
		}
		respond(w, 200, map[string]any{"data": map[string]bool{"allowed": true}})
	case r.URL.Path == "/api/v1/quotes":
		param := r.URL.Query().Get("symbols")
		if param == "" {
			failure(w, 400, "symbols is required, e.g. ?symbols=SCOM,EQTY")
			return
		}
		symbols := []string{}
		for _, v := range strings.Split(param, ",") {
			if v = strings.ToUpper(strings.TrimSpace(v)); v != "" {
				symbols = append(symbols, v)
			}
		}
		if len(symbols) > 1000 || len(param) > 16384 {
			failure(w, 400, "Too many symbols")
			return
		}
		data, err := s.Store.Quotes(ctx, exchange, symbols)
		if err != nil {
			failure(w, 500, "Internal server error")
			return
		}
		if data == nil {
			data = []json.RawMessage{}
		}
		respond(w, 200, map[string]any{"data": data})
	case strings.HasPrefix(r.URL.Path, "/api/v1/quotes/"):
		symbol := strings.TrimPrefix(r.URL.Path, "/api/v1/quotes/")
		if symbol == "" || strings.Contains(symbol, "/") {
			failure(w, 404, "Not found")
			return
		}
		data, err := s.Store.Quotes(ctx, exchange, []string{strings.ToUpper(symbol)})
		if err != nil {
			failure(w, 500, "Internal server error")
			return
		}
		if len(data) == 0 {
			failure(w, 404, "No quote found for "+symbol+" on "+exchange)
			return
		}
		respond(w, 200, map[string]any{"data": data[0]})
	case r.URL.Path == "/api/v1/sectors":
		data, err := s.Store.Sectors(ctx)
		if err != nil {
			failure(w, 500, "Internal server error")
			return
		}
		if data == nil {
			data = []json.RawMessage{}
		}
		respond(w, 200, map[string]any{"data": data})
	case r.URL.Path == "/api/v1/instruments":
		data, err := s.Store.Instruments(ctx, exchange)
		if err != nil {
			failure(w, 500, "Internal server error")
			return
		}
		if data == nil {
			data = []json.RawMessage{}
		}
		respond(w, 200, map[string]any{"data": data})
	default:
		failure(w, 501, "This route has not yet been migrated to the native backend.")
	}
}

func canonicalIP(host string) string {
	ip, err := netip.ParseAddr(host)
	if err != nil {
		return "unknown"
	}
	ip = ip.Unmap()
	if ip.Is6() {
		return netip.PrefixFrom(ip, 56).Masked().String()
	}
	return ip.String()
}

type window struct {
	count   int
	expires time.Time
}
type Limiter struct {
	mu      sync.Mutex
	windows map[string]window
}

func NewLimiter() *Limiter { return &Limiter{windows: map[string]window{}} }
func (l *Limiter) Allow(key string, limit int, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if limit <= 0 {
		return false
	}
	v, exists := l.windows[key]
	if !exists || !now.Before(v.expires) {
		if len(l.windows) >= 10000 {
			for k, w := range l.windows {
				if !now.Before(w.expires) {
					delete(l.windows, k)
				}
			}
			if !exists && len(l.windows) >= 10000 {
				return false
			}
		}
		v = window{expires: now.Add(time.Minute)}
	}
	if v.count >= limit {
		return false
	}
	v.count++
	l.windows[key] = v
	return true
}
