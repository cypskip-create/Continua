package main

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/billing"
	"continua/backend/internal/cache"
	"continua/backend/internal/config"
	"continua/backend/internal/diagnostics"
	"continua/backend/internal/engine"
	"continua/backend/internal/httpapi"
	"continua/backend/internal/marketdata"
	"continua/backend/internal/objectstore"
	"continua/backend/internal/publication"
	"continua/backend/internal/streaming"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	// Local candidate only until the exhaustive migration/cutover gates pass.
	if os.Getenv("NODE_ENV") == "production" || config.Enabled(os.Getenv, "CONTINUA_NATIVE_PRODUCTION") {
		slog.Error("Native production cutover blocked: rewrite incomplete")
		os.Exit(1)
	}
	settings, err := config.Load(os.Getenv)
	if err != nil {
		slog.Error("Native environment configuration rejected")
		os.Exit(1)
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: settings.LogLevel})))
	connection := settings.DatabaseURL
	store, err := marketdata.Open(connection)
	if err != nil {
		slog.Error("Database configuration rejected")
		os.Exit(1)
	}
	defer store.DB.Close()
	objects, objectMode, err := objectstore.FromEnvironment(os.Getenv)
	if err != nil {
		slog.Error("Private processed storage configuration rejected")
		os.Exit(1)
	}
	if objects != nil {
		store.ProcessedObjects = objects
	}
	store.ProcessedStorageMode = objectMode
	authenticator := auth.New(store, false)
	authenticator.DevelopmentKey = os.Getenv("DEV_API_KEY")
	api := httpapi.New(store, authenticator)
	if err := api.ConfigureRateLimits(os.Getenv); err != nil {
		slog.Error("Native rate-limit configuration rejected")
		os.Exit(1)
	}
	api.EdgeOriginSecret = os.Getenv("CONTINUA_EDGE_ORIGIN_SECRET")
	if api.EdgeOriginSecret != "" && (len(api.EdgeOriginSecret) < 32 || len(api.EdgeOriginSecret) > 512 || strings.TrimSpace(api.EdgeOriginSecret) != api.EdgeOriginSecret) {
		slog.Error("Native edge identity configuration rejected")
		os.Exit(1)
	}
	runtimeMetrics := diagnostics.New(store.DB)
	api.RuntimeSnapshot = func() any { return runtimeMetrics.Snapshot() }
	go runtimeMetrics.Run(ctx, func(snapshot diagnostics.Snapshot, pressure bool) {
		if pressure {
			slog.Warn("Runtime pressure", "metrics", snapshot)
		} else {
			slog.Info("Runtime diagnostics", "metrics", snapshot)
		}
	})
	api.RequestLog = func(request httpapi.RequestSummary) {
		slog.Info("HTTP request", "request_id", request.RequestID, "method", request.Method, "status", request.Status, "response_bytes", request.Bytes, "duration_ms", request.Duration.Milliseconds(), "panic_recovered", request.Panicked)
	}
	api.QuoteWarning = func(count int, age time.Duration) {
		slog.Warn("Stale served quotes during market session", "quote_count", count, "oldest_age_ms", age.Milliseconds())
	}
	cacheClient, closeCache, err := cache.FromEnvironment(os.Getenv, true)
	if err != nil {
		slog.Error("Native cache configuration rejected")
		os.Exit(1)
	}
	api.ReadCache = cacheClient
	defer closeCache()
	hub := streaming.New(ctx, authenticator)
	hub.AllowedOrigin = func(origin string) bool { return httpapi.AllowedOrigin(origin, api.Origins) }
	api.Stream = hub
	api.PublishQuote = func(raw json.RawMessage) error { return hub.Publish(streaming.Event{Type: "quote", Payload: raw}) }
	api.PublishCorporateAction = func(raw json.RawMessage) error {
		return hub.Publish(streaming.Event{Type: "corporate_action", Payload: raw})
	}
	api.IgnoreCalendar = settings.Flags["IGNORE_TRADING_CALENDAR"]
	if err := api.ConfigureUsage(os.Getenv); err != nil {
		slog.Error("Native usage accounting configuration rejected")
		os.Exit(1)
	}
	billingConfig, err := billing.ConfigFromEnvironment(os.Getenv)
	if err != nil || billingConfig.LiveEnabled || billingConfig.Mode != "test" {
		slog.Error("Local native candidate permits isolated Test Mode billing only")
		os.Exit(1)
	}
	// Never retain a live provider key in this incomplete local candidate.
	billingConfig.LiveKey = ""
	billingStore := &billing.SQLStore{DB: store.DB}
	billingService := &billing.Service{Config: billingConfig, Store: billingStore, Provider: billing.NewProvider("", billingConfig.TestKey), Warn: func(message string) { slog.Warn(message) }}
	api.Billing = billingService
	api.PaymentWebhook = http.HandlerFunc(billingService.Webhook)
	if settings.Flags["NATIVE_ENABLE_BILLING_WORKERS"] {
		if !billingConfig.RenewalReady() {
			slog.Error("Native test renewal worker configuration incomplete")
			os.Exit(1)
		}
		renewals := &billing.RenewalWorker{Service: billingService, Store: billingStore, Warn: billingService.Warn}
		jobCtx, cancelJobs := context.WithCancel(ctx)
		jobDone := make(chan struct{})
		go func() { defer close(jobDone); renewals.Start(jobCtx) }()
		defer func() {
			cancelJobs()
			select {
			case <-jobDone:
			case <-time.After(10 * time.Second):
				slog.Warn("Native renewal shutdown grace exceeded")
			}
		}()
	}
	if settings.Flags["NATIVE_ENABLE_PUBLICATION_WORKERS"] && os.Getenv("NATIVE_PYTHON_BIN") == "" {
		slog.Error("Native publication worker requires Python")
		os.Exit(1)
	}
	if revision := os.Getenv("NATIVE_CANDIDATE_REVISION"); revision != "" {
		api.Revision = revision
	}
	if python := os.Getenv("NATIVE_PYTHON_BIN"); python != "" {
		script := os.Getenv("NATIVE_PYTHON_SCRIPT")
		if script == "" {
			script = "engine-python/worker.py"
		}
		worker := engine.NewWorker(python, script)
		// Key reuse does not authorize spending. This explicit opt-in stays off
		// in all deployment configuration until paid AI is separately approved.
		api.Assistant = engine.NewAssistant(store, worker, os.Getenv("OPENAI_API_KEY"), settings.Flags["ENGINE_AI_ENABLED"], api.AIMonthlyCap, api.AIDailyLimit)
		api.Engine = worker
		api.Advanced = engine.NewResearchWorker(python, script)
		api.Notebook = &engine.Notebook{DB: store.DB, Worker: worker}
		api.Admin = &httpapi.AdminService{Key: os.Getenv("ADMIN_API_KEY"), Store: store, Worker: worker, Publisher: &publication.Service{DB: store.DB, Worker: worker, DocumentWorker: engine.NewDocumentWorker(python, script), DurableRefresh: true}}
		api.PreferencesStore = &engine.PreferenceRepository{DB: store.DB, Worker: worker}
		news := &engine.NewsReader{Store: store, Worker: engine.NewEvidenceWorker(python, script), Cache: api.ReadCache}
		api.News = news
		inputs := &engine.NativeInputs{Store: store, Worker: worker, News: news}
		api.Valuations = inputs
		recompute := engine.NewRecomputeService(store, worker)
		api.Recompute = recompute
		bundles := engine.NewBundleService(inputs, worker, &engine.ObservationRepository{DB: store.DB, Worker: worker}, api.ReadCache)
		api.EngineBundles = bundles
		api.PortfolioResearch = engine.NewPortfolioWorkspace(store, worker, api.Advanced, bundles)
		api.Monitor = &engine.MonitorWorker{DB: store.DB, Bundles: bundles, Worker: worker}
		defer bundles.Close(context.Background())
		if settings.Flags["NATIVE_ENABLE_PUBLICATION_WORKERS"] {
			runner, err := publicationRunner(store, api, bundles, recompute, worker, python, script)
			if err != nil {
				slog.Error("Native publication configuration rejected")
				os.Exit(1)
			}
			jobCtx, cancelJobs := context.WithCancel(ctx)
			jobDone := make(chan struct{})
			go func() { defer close(jobDone); _ = runner.Run(jobCtx) }()
			defer func() {
				cancelJobs()
				select {
				case <-jobDone:
				case <-time.After(10 * time.Second):
					slog.Warn("Native enrichment shutdown exceeded grace period")
				}
			}()
		}
	}
	supabase := os.Getenv("SUPABASE_URL")
	if supabase == "" {
		supabase = "https://jjsetogmnumoudrovpzn.supabase.co"
	}
	api.Users = auth.NewUserVerifier(supabase, store)
	for _, origin := range settings.Origins {
		api.Origins[origin] = true
	}
	transfer := httpapi.NewPublicTransfer(api)
	defer func() { slog.Info("Native public response transfer totals", "counters", transfer.Stats()) }()
	server := &http.Server{Addr: "127.0.0.1:4080", Handler: transfer, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 75 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 32768}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	slog.Info("Native Go candidate listening", "address", server.Addr, "productionCutover", false)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("Native candidate stopped")
		os.Exit(1)
	}
}
