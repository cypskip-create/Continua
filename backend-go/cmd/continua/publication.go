package main

import (
	"context"
	"continua/backend/internal/config"
	"continua/backend/internal/engine"
	"continua/backend/internal/httpapi"
	"continua/backend/internal/ingestion"
	"continua/backend/internal/jobs"
	"continua/backend/internal/marketdata"
	"continua/backend/internal/publication"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"strconv"
	"time"
)

func publicationRunner(store *marketdata.Store, api *httpapi.Server, bundles *engine.BundleService, recompute *engine.RecomputeService, worker *engine.Worker, python, script string) (*jobs.Runner, error) {
	// Schema is deliberately not auto-created against an arbitrary DB at boot.
	// Deployment applies the reviewed SQL migration before enabling these jobs.
	checkCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rows, err := store.DB.QueryContext(checkCtx, `SELECT security_id,symbol,requested_version,next_attempt_at,attempts,lease_token,lease_until FROM market.native_research_refresh LIMIT 0`)
	if err != nil {
		return nil, errors.New("native publication outbox migration is required")
	}
	rows.Close()
	store.DurableQuoteRefresh = true
	invalidate := func(symbol string) {
		api.ReadCache.DeletePrefix("financial-read:NSE:" + symbol + ":")
		api.ReadCache.Delete("ratios:NSE:" + symbol)
		api.ReadCache.Delete("afriscore:NSE:" + symbol)
		bundles.Invalidate("NSE", symbol)
	}
	service := &publication.Service{DB: store.DB, Worker: worker, DocumentWorker: engine.NewDocumentWorker(python, script), DurableRefresh: true,
		RefreshResearch: func(ctx context.Context, id, symbol string) error {
			invalidate(symbol)
			defer invalidate(symbol)
			raw, err := recompute.Recompute(ctx, id)
			if err != nil {
				return err
			}
			if raw == nil {
				return errors.New("dated research inputs unavailable; retry refresh")
			}
			return nil
		},
	}
	runner := jobs.New()
	publicationBatch := 25
	if value := os.Getenv("DOCUMENT_PUBLICATION_BATCH_SIZE"); value != "" {
		number, err := strconv.Atoi(value)
		if err != nil || number < 1 || number > 100 {
			return nil, errors.New("invalid publication batch")
		}
		publicationBatch = number
	}
	newsBridge := &ingestion.NewsBridge{Store: store, Worker: engine.NewEvidenceWorker(python, script)}
	announcements := &ingestion.AnnouncementBridge{Store: store, Worker: newsBridge.Worker}
	revalidationCursor := "0"
	runner.Report = func(name string, err error) {
		if err != nil {
			slog.Warn("Native enrichment failed; retry scheduled", "job", name)
		}
	}
	schedule := func(key, fallback string) string {
		if value := os.Getenv(key); value != "" {
			return value
		}
		return fallback
	}
	for _, job := range []jobs.Job{
		{Name: "quote-publication", Schedule: "*/30 * * * * *", Timeout: 15 * time.Second, Cooldown: 15 * time.Second, Initial: true, Run: func(ctx context.Context) error {
			// Publishing an existing dated extraction performs no external polling;
			// closing-session observations must also recover after an evening boot.
			pipeline := ingestion.QuotePipeline{Store: store, AfterCommit: func(ctx context.Context, rows []json.RawMessage) error {
				api.ReadCache.DeletePrefix("quotes:")
				for _, raw := range rows {
					var q struct{ Symbol string }
					if json.Unmarshal(raw, &q) != nil {
						return errors.New("invalid stored quote event")
					}
					invalidate(q.Symbol)
					if api.PublishQuote != nil {
						if err := api.PublishQuote(raw); err != nil {
							return err
						}
					}
				}
				return nil
			}}
			_, err := pipeline.Run(ctx)
			return err
		}},
		{Name: "index-publication", Schedule: "*/5 * * * *", Timeout: 30 * time.Second, Cooldown: time.Minute, Initial: true, Run: func(ctx context.Context) error {
			pipeline := ingestion.IndexPipeline{Store: store, AfterCommit: func(context.Context) error { api.ReadCache.DeletePrefix("indices:"); return nil }}
			_, err := pipeline.Run(ctx)
			return err
		}},
		{Name: "announcements", Schedule: schedule("ANNOUNCEMENTS_BRIDGE_CRON", "*/5 * * * *"), Timeout: 20 * time.Minute, Run: func(ctx context.Context) error {
			for batch := 0; batch < 10; batch++ {
				summary, err := announcements.Run(ctx, "NSE", 100)
				if err != nil {
					return err
				}
				if summary.Processed < 100 || summary.Failed == summary.Processed {
					break
				}
			}
			return nil
		}},
		{Name: "document-publication", Schedule: schedule("DOCUMENT_PUBLICATION_CRON", "*/2 * * * *"), Timeout: 20 * time.Minute, Cooldown: time.Minute, Initial: true, Run: func(ctx context.Context) error {
			_, err := service.AutomaticDocuments(ctx, publicationBatch, nil)
			return err
		}},
		{Name: "news-bridge", Schedule: schedule("NEWS_BRIDGE_CRON", "*/2 * * * *"), Timeout: 20 * time.Minute, Cooldown: time.Minute, Initial: true, Run: func(ctx context.Context) error {
			for batch := 0; batch < 10; batch++ {
				summary, err := newsBridge.Run(ctx, "NSE", 100)
				if summary != nil && summary.Processed > summary.Failed {
					api.ReadCache.DeletePrefix("news:list:")
				}
				if err != nil {
					return err
				}
				if summary.Processed < 100 || summary.Failed == summary.Processed {
					break
				}
			}
			repaired, err := ingestion.RevalidateNews(ctx, store, newsBridge.Worker, revalidationCursor, 100)
			if repaired != nil && repaired.Corrected > 0 {
				api.ReadCache.DeletePrefix("news:list:")
			}
			if err != nil {
				return err
			}
			if repaired.Processed < 100 {
				revalidationCursor = "0"
			} else {
				revalidationCursor = repaired.LastID
			}
			return nil
		}},
		{Name: "financial-candidates", Schedule: schedule("FINANCIAL_CANDIDATES_BRIDGE_CRON", "*/5 * * * *"), Timeout: 20 * time.Minute, Run: func(ctx context.Context) error {
			for batch := 0; batch < 10; batch++ {
				summary, err := service.CandidateBridge(ctx, "NSE", 100)
				if err != nil {
					return err
				}
				if summary.ExtractionsProcessed < 100 || summary.Failed == summary.ExtractionsProcessed {
					break
				}
			}
			return nil
		}},
		{Name: "research-refresh", Schedule: "*/2 * * * *", Timeout: 10 * time.Minute, Initial: true, Run: func(ctx context.Context) error { _, err := service.DrainRefresh(ctx, 5); return err }},
	} {
		if err := runner.Add(job); err != nil {
			return nil, err
		}
	}
	api.RequestDocuments = func() { runner.Request("document-publication") }
	api.RequestIndices = func() { runner.Request("index-publication") }
	if config.Enabled(os.Getenv, "ENGINE_MONITOR_ENABLED") {
		monitor := &engine.MonitorWorker{DB: store.DB, Bundles: bundles, Worker: worker}
		if err := runner.Add(jobs.Job{Name: "engine-monitor", Schedule: "*/10 * * * *", Timeout: 20 * time.Minute, Run: func(ctx context.Context) error {
			summary, err := monitor.Run(ctx, nil, nil, nil)
			if err == nil && summary.Failed > 0 {
				return errors.New("native monitoring inputs unavailable; previous states retained")
			}
			return err
		}}); err != nil {
			return nil, err
		}
	}
	api.RequestNews = func() { runner.Request("news-bridge") }
	if origin := os.Getenv("NATIVE_COLLECTOR_URL"); origin != "" {
		collector, err := ingestion.NewCollectorClient(origin, true)
		if err != nil {
			return nil, err
		}
		runner.Cleanup = collector.Close
		for _, kind := range []string{"indices", "news", "documents"} {
			kind := kind
			cooldown := 10 * time.Minute
			if kind == "indices" {
				cooldown = 15 * time.Minute
			}
			err := runner.AddManual(jobs.Job{Name: "collect-" + kind, Timeout: 75 * time.Second, Cooldown: cooldown, Run: func(ctx context.Context) error {
				if err := collector.Refresh(ctx, kind); err != nil {
					return err
				}
				if kind == "indices" {
					if err := store.RefreshPublishedNSEIndices(ctx, time.Now().UTC()); err != nil {
						return err
					}
					api.ReadCache.DeletePrefix("indices:")
				}
				return nil
			}})
			if err != nil {
				collector.Close()
				return nil, err
			}
		}
		api.RequestIndices = func() { runner.Request("collect-indices"); runner.Request("index-publication") }
		api.RequestNews = func() { runner.Request("collect-news"); runner.Request("news-bridge") }
		api.RequestDocuments = func() { runner.Request("collect-documents"); runner.Request("document-publication") }
	}
	if config.Enabled(os.Getenv, "NATIVE_ENABLE_CLOSE_PUBLICATION") {
		bridge := &ingestion.ClosePublication{Store: store}
		if err := runner.Add(jobs.Job{Name: "daily-close-publication", Schedule: "*/15 * * * *", Timeout: 2 * time.Minute, Cooldown: time.Minute, Run: func(ctx context.Context) error {
			// Receipts select unfinished/changed evidence across restarts; do not
			// advance a process-local cursor past newly approved old extractions.
			for i := 0; i < 4; i++ {
				summary, err := bridge.Run(ctx, 0, 1)
				if err != nil {
					return err
				}
				if summary.Extractions == 0 {
					break
				}
			}
			return nil
		}}); err != nil {
			return nil, err
		}
	}
	if config.Enabled(os.Getenv, "NATIVE_ENABLE_SOURCE_SYNC") {
		transport, err := ingestion.NewMarketTransport(os.Getenv("NATIVE_COLLECTOR_ORIGIN"), os.Getenv("NATIVE_MARKET_SOURCE_ID"), os.Getenv("COLLECTOR_MARKET_KEY"), true)
		if err != nil {
			return nil, err
		}
		previousCleanup := runner.Cleanup
		runner.Cleanup = func() {
			transport.Close()
			if previousCleanup != nil {
				previousCleanup()
			}
		}
		adapter := &ingestion.NSEAdapter{Transport: transport, Worker: worker}
		syncer := &ingestion.SourceSync{Store: store, Adapter: adapter, Worker: worker, TradingDay: func(now time.Time) bool { return api.IgnoreCalendar || jobs.TradingDay("NSE", now) }, MarketOpen: func(now time.Time) bool { return jobs.MarketOpen("NSE", now, api.IgnoreCalendar) }, AfterSecurityCommit: func(ctx context.Context, security marketdata.SecurityInput) error {
			invalidate(security.Symbol)
			defer invalidate(security.Symbol)
			_, err := recompute.Recompute(ctx, security.ID)
			return err
		}, AfterActionCommit: func(ctx context.Context, action marketdata.CorporateAction) error {
			if api.PublishCorporateAction == nil {
				return nil
			}
			raw, err := json.Marshal(action)
			if err != nil {
				return err
			}
			return api.PublishCorporateAction(raw)
		}}
		if err := syncer.Register(runner, ingestion.SourceSchedules{Fundamentals: schedule("FINANCIALS_SYNC_CRON", "0 4 * * *"), Corporate: schedule("CORPORATE_ACTIONS_SYNC_CRON", "0 5 * * *")}); err != nil {
			transport.Close()
			return nil, err
		}
		if err := runner.AddManual(jobs.Job{Name: "source-listing-bootstrap", Timeout: 10 * time.Minute, Cooldown: time.Hour, Run: func(ctx context.Context) error { _, err := syncer.Bootstrap(ctx); return err }}); err != nil {
			transport.Close()
			return nil, err
		}
		if err := runner.AddManual(jobs.Job{Name: "source-candle-backfill", Timeout: 30 * time.Minute, Cooldown: time.Hour, Run: func(ctx context.Context) error { return syncer.Candles(ctx, true) }}); err != nil {
			transport.Close()
			return nil, err
		}
	}
	if api.Admin != nil {
		api.Admin.RequestJob = runner.Request
	}
	return runner, nil
}
