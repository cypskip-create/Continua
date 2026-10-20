// Native candidate API. Unsupported routes are explicit; never forwards to Node.
package httpapi

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/cache"
	"continua/backend/internal/engine"
	"encoding/json"
	"errors"
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
	Store                            MarketStore
	Auth                             *auth.Authenticator
	Users                            *auth.UserVerifier
	Origins                          map[string]bool
	Revision                         string
	Billing                          AccountBilling
	Admin                            *AdminService
	PaymentWebhook                   http.Handler
	Stream                           http.Handler
	PublishQuote                     func(json.RawMessage) error
	PublishCorporateAction           func(json.RawMessage) error
	RequestLog                       func(RequestSummary)
	QuoteWarning                     func(int, time.Duration)
	RuntimeSnapshot                  func() any
	EdgeOriginSecret                 string
	Notebook                         NotebookService
	PortfolioResearch                PortfolioResearchService
	Monitor                          MonitorRunner
	Advanced                         Calculator
	Assistant                        *engine.Assistant
	AIMonthlyCap                     float64
	AIDailyLimit                     int
	IgnoreCalendar                   bool
	largeBodies                      chan struct{}
	Engine                           Calculator
	EngineBundles                    CompanyBundles
	Statistics                       StatisticsProvider
	Valuations                       ValuationProvider
	News                             NewsProvider
	RequestNews                      func()
	Recompute                        ResearchRecompute
	PreferencesStore                 PreferenceStore
	ReadCache                        cache.Client
	RequestIndices, RequestDocuments func()
	limiter                          *Limiter
	preLimiter                       *Limiter
	defaultRateLimit                 int
}

type AccountBilling interface {
	AccountHTTP(context.Context, http.ResponseWriter, *http.Request, *auth.Identity) bool
}

func New(store MarketStore, authenticator *auth.Authenticator) *Server {
	return &Server{Store: store, Auth: authenticator, Origins: map[string]bool{}, limiter: NewLimiter(), preLimiter: NewLimiter(), defaultRateLimit: 120, Revision: "native-rewrite-incomplete", ReadCache: cache.NewMemory(), largeBodies: make(chan struct{}, 2), AIMonthlyCap: 5, AIDailyLimit: 20}
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
	body := map[string]string{"error": message}
	if status == 429 {
		body["code"] = "RATE_LIMITED"
	}
	respond(w, status, body)
}
func (s *Server) serveHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; form-action 'none'")
	w.Header().Set("X-DNS-Prefetch-Control", "off")
	w.Header().Set("X-Download-Options", "noopen")
	w.Header().Set("X-Permitted-Cross-Domain-Policies", "none")
	w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
	w.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
	w.Header().Set("Origin-Agent-Cluster", "?1")
	w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
	origin := r.Header.Get("Origin")
	if !AllowedOrigin(origin, s.Origins) {
		failure(w, 403, "Not allowed by CORS")
		return
	}
	if origin != "" {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Expose-Headers", "Retry-After,RateLimit-Limit,RateLimit-Remaining,RateLimit-Reset,cf-mitigated")
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
	if !strings.HasPrefix(r.URL.Path, "/api/v1/") && !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		failure(w, 404, "Not found")
		return
	}
	host := s.clientIdentity(r)
	accountPrefix := strings.HasPrefix(r.URL.Path, "/api/v1/")
	if accountPrefix && r.URL.Path != "/api/v1/billing/paystack/webhook" && !s.preLimiter.Allow("ip:"+canonicalIP(host), 120, time.Now()) {
		w.Header().Set("Retry-After", "60")
		failure(w, 429, "Too many requests. Please retry shortly.")
		return
	}
	if strings.EqualFold(r.Header.Get("Upgrade"), "websocket") && s.Stream != nil {
		s.Stream.ServeHTTP(w, r)
		return
	}
	budget := 12 * time.Second
	// Full issuer-news evidence scans are bounded by the serial Python worker's
	// 30-second profile. A shorter arbitrary HTTP cap discarded valid results.
	if r.Method == http.MethodGet && (r.URL.Path == "/api/v1/news" || strings.HasPrefix(r.URL.Path, "/api/v1/news/")) {
		budget = 30 * time.Second
	}
	if strings.HasPrefix(r.URL.Path, "/api/v1/engine/") || strings.HasPrefix(r.URL.Path, "/api/v1/billing/") || strings.HasPrefix(r.URL.Path, "/api/v1/admin/") {
		budget = 60 * time.Second
	}
	ctx, cancel := context.WithTimeout(r.Context(), budget)
	defer cancel()
	if s.admin(ctx, w, r) {
		return
	}
	if r.URL.Path == "/api/v1/billing/paystack/webhook" {
		if s.PaymentWebhook == nil {
			failure(w, 503, "Payment event verification unavailable")
		} else {
			s.PaymentWebhook.ServeHTTP(w, r.WithContext(ctx))
		}
		return
	}
	if s.Auth == nil {
		failure(w, 503, "Native access verification is not configured.")
		return
	}
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
	accountRoute := strings.HasPrefix(r.URL.Path, "/api/v1/engine/") || strings.HasPrefix(r.URL.Path, "/api/v1/billing/") || r.URL.Path == "/api/v1/backtest" || strings.HasPrefix(r.URL.Path, "/api/v1/volume-profile/")
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
	limit := s.defaultRateLimit
	if key != nil {
		limit = key.RateLimitPerMin
	}
	duration := s.limiter.duration
	if duration <= 0 {
		duration = time.Minute
	}
	if !s.admit(ctx, w, limitIdentity, limit, duration) {
		return
	}
	if policy, maximum := workloadPolicy(r); maximum > 0 {
		workIdentity := limitIdentity
		if identity != nil {
			workIdentity = "user:" + identity.UserID
		}
		if !s.admit(ctx, w, "work:"+workIdentity+":"+policy, maximum, time.Minute) {
			return
		}
	}

	if s.Billing != nil && s.Billing.AccountHTTP(ctx, w, r, identity) {
		return
	}
	if s.preferences(ctx, w, r, identity) {
		return
	}
	if s.closeHistory(ctx, w, r) {
		return
	}
	if s.workspace(ctx, w, r, identity) {
		return
	}
	if s.notebook(ctx, w, r, identity) {
		return
	}
	if s.portfolioResearch(ctx, w, r, identity) {
		return
	}
	if s.assistant(ctx, w, r, identity) {
		return
	}
	if s.usage(ctx, w, r, identity) {
		return
	}
	if s.pipelineHealth(ctx, w, r, identity) {
		return
	}
	if s.peers(ctx, w, r, identity) {
		return
	}
	if s.workbenchReads(ctx, w, r, identity) {
		return
	}
	if s.advanced(ctx, w, r, identity) {
		return
	}
	if s.stockRisk(ctx, w, r, identity) {
		return
	}
	if s.riskLabs(ctx, w, r, identity) {
		return
	}
	if s.technicalResearch(ctx, w, r, identity) {
		return
	}
	if r.Method != http.MethodGet {
		failure(w, 404, "Not found")
		return
	}
	exchange := r.URL.Query().Get("exchange")
	if !r.URL.Query().Has("exchange") {
		exchange = "NSE"
	}
	if exchange != "NSE" || len(r.URL.Query()["exchange"]) > 1 {
		failure(w, 400, "Invalid exchange")
		return
	}
	if s.screening(ctx, w, r, exchange) {
		return
	}
	if s.marketResearch(ctx, w, r) {
		return
	}
	if s.portfolioOverview(ctx, w, r, identity, exchange) {
		return
	}
	if s.companyResearch(ctx, w, r, identity, exchange) {
		return
	}
	if s.publisherReads(ctx, w, r, exchange) {
		return
	}
	if s.marketReads(ctx, w, r, exchange) {
		return
	}
	if s.actionReads(ctx, w, r, exchange) {
		return
	}
	if s.newsReads(ctx, w, r, exchange) {
		return
	}
	if s.marketExtras(ctx, w, r, exchange) {
		return
	}
	if s.indicatorReads(ctx, w, r, exchange) {
		return
	}
	if s.statisticsReads(ctx, w, r, exchange) {
		return
	}
	if s.valuationReads(ctx, w, r, exchange) {
		return
	}
	if s.storedResearch(ctx, w, r, exchange) {
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
		s.checkQuoteFreshness(data, time.Now())
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
		s.checkQuoteFreshness(data, time.Now())
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
		failure(w, 404, "Not found")
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
	mu       sync.Mutex
	windows  map[string]window
	duration time.Duration
}

func NewLimiter() *Limiter { return &Limiter{windows: map[string]window{}, duration: time.Minute} }
func (l *Limiter) Allow(key string, limit int, now time.Time) bool {
	return l.allowWindow(key, limit, now, l.duration)
}
func (l *Limiter) allowWindow(key string, limit int, now time.Time, duration time.Duration) bool {
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
		if duration <= 0 {
			duration = time.Minute
		}
		v = window{expires: now.Add(duration)}
	}
	if v.count >= limit {
		return false
	}
	v.count++
	l.windows[key] = v
	return true
}
