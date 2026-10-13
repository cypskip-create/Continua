package main

import (
	"context"
	"continua/backend/internal/auth"
	"continua/backend/internal/engine"
	"continua/backend/internal/httpapi"
	"continua/backend/internal/marketdata"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

func main() {
	// Local candidate only until the exhaustive migration/cutover gates pass.
	if os.Getenv("NODE_ENV") == "production" || os.Getenv("CONTINUA_NATIVE_PRODUCTION") == "true" {
		slog.Error("Native production cutover blocked: rewrite incomplete")
		os.Exit(1)
	}
	if driver := os.Getenv("CACHE_DRIVER"); driver != "" && driver != "memory" {
		slog.Error("Native distributed cache migration is incomplete; configured driver cannot be silently bypassed")
		os.Exit(1)
	}
	connection := os.Getenv("DATABASE_URL")
	if connection == "" {
		slog.Error("DATABASE_URL is required")
		os.Exit(1)
	}
	store, err := marketdata.Open(connection)
	if err != nil {
		slog.Error("Database configuration rejected")
		os.Exit(1)
	}
	defer store.DB.Close()
	authenticator := auth.New(store, false)
	authenticator.DevelopmentKey = os.Getenv("DEV_API_KEY")
	api := httpapi.New(store, authenticator)
	if revision := os.Getenv("NATIVE_CANDIDATE_REVISION"); revision != "" {
		api.Revision = revision
	}
	if python := os.Getenv("NATIVE_PYTHON_BIN"); python != "" {
		script := os.Getenv("NATIVE_PYTHON_SCRIPT")
		if script == "" {
			script = "engine-python/worker.py"
		}
		worker := engine.NewWorker(python, script)
		api.Engine = worker
		api.PreferencesStore = &engine.PreferenceRepository{DB: store.DB, Worker: worker}
	}
	supabase := os.Getenv("SUPABASE_URL")
	if supabase == "" {
		supabase = "https://jjsetogmnumoudrovpzn.supabase.co"
	}
	api.Users = auth.NewUserVerifier(supabase, store)
	for _, origin := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		if origin = strings.TrimSpace(origin); origin != "" {
			api.Origins[origin] = true
		}
	}
	server := &http.Server{Addr: "127.0.0.1:4080", Handler: api, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 32768}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
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
