// Package config validates native startup inputs without loading dotenv files,
// fetching providers, printing credentials or changing the process environment.
package config

import (
	"errors"
	"log/slog"
	"net/url"
	"strings"
)

type Environment struct {
	DatabaseURL string
	Origins     []string
	LogLevel    slog.Level
	Flags       map[string]bool
}

func Boolean(value string, defaultValue bool) (bool, error) {
	if value == "" {
		return defaultValue, nil
	}
	switch strings.ToLower(value) {
	case "true", "1", "yes":
		return true, nil
	case "false", "0", "no":
		return false, nil
	}
	return false, errors.New("invalid boolean environment setting")
}

func Enabled(getenv func(string) string, key string) bool {
	enabled, err := Boolean(getenv(key), false)
	return err == nil && enabled
}

func Load(getenv func(string) string) (Environment, error) {
	cfg := Environment{DatabaseURL: getenv("DATABASE_URL"), Flags: map[string]bool{}, LogLevel: slog.LevelInfo}
	if strings.TrimSpace(cfg.DatabaseURL) == "" {
		return cfg, errors.New("database configuration is required")
	}
	mode := getenv("NODE_ENV")
	if mode != "" && mode != "development" && mode != "test" && mode != "production" {
		return cfg, errors.New("invalid runtime environment")
	}
	for _, key := range []string{"CONTINUA_NATIVE_PRODUCTION", "IGNORE_TRADING_CALENDAR", "NATIVE_ENABLE_BILLING_WORKERS", "NATIVE_ENABLE_PUBLICATION_WORKERS", "NATIVE_ENABLE_SOURCE_SYNC", "NATIVE_ENABLE_CLOSE_PUBLICATION", "ENGINE_MONITOR_ENABLED", "ENGINE_AI_ENABLED"} {
		value, err := Boolean(getenv(key), false)
		if err != nil {
			return cfg, errors.New("invalid native feature configuration")
		}
		cfg.Flags[key] = value
	}
	switch getenv("LOG_LEVEL") {
	case "", "info":
	case "fatal", "error":
		cfg.LogLevel = slog.LevelError
	case "warn":
		cfg.LogLevel = slog.LevelWarn
	case "debug", "trace":
		cfg.LogLevel = slog.LevelDebug
	default:
		return cfg, errors.New("invalid native logging configuration")
	}
	if driver := getenv("CACHE_DRIVER"); driver != "" && driver != "memory" && driver != "redis" && driver != "upstash" {
		return cfg, errors.New("invalid cache driver")
	}
	for _, key := range []string{"ADMIN_API_KEY", "CONTINUA_EDGE_ORIGIN_SECRET", "COLLECTOR_MARKET_KEY"} {
		value := getenv(key)
		if value != "" && (len(value) < 32 || len(value) > 512 || strings.TrimSpace(value) != value) {
			return cfg, errors.New("invalid server credential configuration")
		}
	}
	if cfg.Flags["NATIVE_ENABLE_PUBLICATION_WORKERS"] && getenv("NATIVE_PYTHON_BIN") == "" {
		return cfg, errors.New("native publication requires Python")
	}
	if cfg.Flags["NATIVE_ENABLE_SOURCE_SYNC"] && (!cfg.Flags["NATIVE_ENABLE_PUBLICATION_WORKERS"] || getenv("COLLECTOR_MARKET_KEY") == "" || getenv("NATIVE_MARKET_SOURCE_ID") == "" || getenv("NATIVE_COLLECTOR_ORIGIN") == "") {
		return cfg, errors.New("source synchronization configuration incomplete")
	}
	if cfg.Flags["NATIVE_ENABLE_CLOSE_PUBLICATION"] && !cfg.Flags["NATIVE_ENABLE_PUBLICATION_WORKERS"] {
		return cfg, errors.New("close publication requires native publication workers")
	}
	origins := getenv("ALLOWED_ORIGINS")
	if origins == "" {
		origins = "http://localhost:8080,http://127.0.0.1:8080,https://afrifinance.lovable.app"
	}
	seen := map[string]bool{}
	for _, value := range strings.Split(origins, ",") {
		origin := strings.TrimSpace(value)
		if origin == "" {
			continue
		}
		u, err := url.Parse(origin)
		if err != nil || len(origin) > 2048 || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" || (u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1"))) {
			return cfg, errors.New("invalid browser origin configuration")
		}
		if !seen[origin] {
			cfg.Origins = append(cfg.Origins, origin)
			seen[origin] = true
		}
		if len(cfg.Origins) > 100 {
			return cfg, errors.New("browser origin configuration exceeds budget")
		}
	}
	return cfg, nil
}
