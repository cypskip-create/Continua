import express from "express";
import { env } from "../config/index.js";
import { logger } from "../monitoring/logger.js";
import { checkHealth } from "../monitoring/healthCheck.js";
import { listEnabledSources, getSource } from "../storage/sourcesRepository.js";
import { listDeadLetters } from "../storage/deadLettersRepository.js";
import { crawlSource } from "../crawler/crawlSource.js";
import { runAdapter } from "../adapters/runAdapter.js";
import { nseAnnouncementsAdapter } from "../adapters/nse/announcementsAdapter.js";
import { createRssFeedAdapter } from "../adapters/rss/createRssFeedAdapter.js";
import { listNeedsReview } from "../storage/extractionsRepository.js";
import { reprocessArtifact } from "../extraction/reprocessArtifact.js";
import { sweepUnextractedArtifacts } from "../extraction/extractionSweep.js";
import { getCrawlStatus } from "../monitoring/crawlStatus.js";
import { newsScheduleStatus, refreshNewsSources } from "../scheduler/scheduler.js";

export function createServer() {
  const app = express();
  app.use(express.json());
  app.post("/news/refresh", (_req, res) => {
    void refreshNewsSources().catch(err => logger.error({ err }, "Reader news refresh failed"));
    res.status(202).json({ status: "accepted", ...newsScheduleStatus() });
  });

  app.get("/health", async (_req, res) => {
    const health = await checkHealth();
    res.status(health.status === "ok" ? 200 : 503).json(health);
  });

  app.get("/news/status", (_req, res) => res.json(newsScheduleStatus()));

  // Phase 0: read-only visibility into configured sources. Crawl-trigger
  // and job-status endpoints (§40) land in a later phase once there's an
  // actual crawler to trigger.
  app.get("/sources", async (_req, res) => {
    const sources = await listEnabledSources();
    res.json(sources);
  });

  // Phase 1: manual crawl trigger for testing. This is a synchronous,
  // single-pass call — fine for a handful of URLs during development.
  // Once real scheduling exists (§19, Phase 6) this becomes
  // fire-and-forget against a job queue instead of blocking the request.
  app.post("/sources/:id/crawl", async (req, res) => {
    const source = await getSource(req.params.id);
    if (!source) {
      res.status(404).json({ error: "source_not_found", id: req.params.id });
      return;
    }
    try {
      const batchSize = req.body?.batchSize ?? 20;
      const summary = await crawlSource(source.id, batchSize);
      res.json(summary);
    } catch (err) {
      logger.error({ err, sourceId: source.id }, "Crawl trigger failed");
      res.status(500).json({ error: "crawl_failed", message: (err as Error).message });
    }
  });

  // Dry run — see what discover() would find WITHOUT downloading any
  // PDFs. Use this first: the title-pairing heuristic (nearest preceding
  // heading) hasn't been verified against NSE's actual HTML from this
  // environment, only inferred from a markdown-converted fetch. Check
  // that titles look sane before running the real /announcements below.
  app.get("/adapters/nse/announcements/preview", async (_req, res) => {
    try {
      const docs = await nseAnnouncementsAdapter.discover();
      res.json({ count: docs.length, documents: docs });
    } catch (err) {
      logger.error({ err }, "NSE announcements discover() failed");
      res.status(500).json({ error: "discover_failed", message: (err as Error).message });
    }
  });

  // Phase 2: NSE announcements adapter. Separate from the generic
  // /sources/:id/crawl trigger above — adapters run their own
  // discover -> fetch -> parse pipeline rather than the crawl_state
  // queue loop.
  app.post("/adapters/nse/announcements", async (_req, res) => {
    try {
      const summary = await runAdapter(nseAnnouncementsAdapter);
      res.json(summary);
    } catch (err) {
      logger.error({ err }, "NSE announcements adapter run failed");
      res.status(500).json({ error: "adapter_run_failed", message: (err as Error).message });
    }
  });

  // Phase 6: visibility into permanently-failed URLs (§21, §39) —
  // anything here exhausted its retries and needs a human look, or at
  // minimum confirms the crawler isn't silently losing failures.
  app.get("/dead-letters", async (req, res) => {
    const sourceId = typeof req.query.source === "string" ? req.query.source : undefined;
    const deadLetters = await listDeadLetters(sourceId);
    res.json(deadLetters);
  });

  // Phase 7: generic RSS/Atom adapter — one adapter implementation
  // shared across every source configured with adapter='rss'. :sourceId
  // is looked up rather than hardcoded, since this endpoint has to work
  // for whichever RSS sources are actually configured, not one fixed
  // feed like the NSE endpoints above.
  app.get("/adapters/rss/:sourceId/preview", async (req, res) => {
    const source = await getSource(req.params.sourceId);
    if (!source) {
      res.status(404).json({ error: "source_not_found", id: req.params.sourceId });
      return;
    }
    try {
      const adapter = createRssFeedAdapter(source);
      const docs = await adapter.discover();
      res.json({ count: docs.length, documents: docs });
    } catch (err) {
      logger.error({ err, sourceId: source.id }, "RSS discover() failed");
      res.status(500).json({ error: "discover_failed", message: (err as Error).message });
    }
  });

  app.post("/adapters/rss/:sourceId", async (req, res) => {
    const source = await getSource(req.params.sourceId);
    if (!source) {
      res.status(404).json({ error: "source_not_found", id: req.params.sourceId });
      return;
    }
    try {
      const adapter = createRssFeedAdapter(source);
      const summary = await runAdapter(adapter);
      res.json(summary);
    } catch (err) {
      logger.error({ err, sourceId: source.id }, "RSS adapter run failed");
      res.status(500).json({ error: "adapter_run_failed", message: (err as Error).message });
    }
  });

  // Phase 8: human review queue (§39) — the latest extraction per
  // artifact where that latest extraction still needs a human look.
  app.get("/extractions/needs-review", async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const items = await listNeedsReview(limit);
    res.json(items);
  });

  // Phase 8: reprocessing (§45) — re-run extraction against an
  // already-stored artifact with the current parser code, without
  // re-downloading. Always creates a new extraction row; the old one
  // stays visible for comparison.
  app.post("/artifacts/:id/reprocess", async (req, res) => {
    const artifactId = Number(req.params.id);
    if (!Number.isInteger(artifactId)) {
      res.status(400).json({ error: "invalid_artifact_id" });
      return;
    }
    try {
      const extraction = await reprocessArtifact(artifactId);
      res.json(extraction);
    } catch (err) {
      logger.error({ err, artifactId }, "Reprocessing failed");
      res.status(500).json({ error: "reprocess_failed", message: (err as Error).message });
    }
  });

  // Manual trigger for the extraction sweep (also runs on its own cron —
  // see scheduler.ts) — catches up any generic-crawled artifact
  // (CMA Kenya, Central Bank of Kenya, company IR pages, ...) that was
  // stored but never extracted, since the generic crawler only stores
  // bytes and doesn't parse them itself.
  app.post("/extractions/sweep", async (req, res) => {
    try {
      const limit = req.body?.limit ?? 50;
      const summary = await sweepUnextractedArtifacts(limit);
      res.json(summary);
    } catch (err) {
      logger.error({ err }, "Extraction sweep failed");
      res.status(500).json({ error: "sweep_failed", message: (err as Error).message });
    }
  });

  // Phase 8: operational overview (§29-30, §40) — crawl state per
  // source, extraction method breakdown, review/dead-letter counts, all
  // in one call rather than ad-hoc SQL every time.
  app.get("/crawl-status", async (_req, res) => {
    const report = await getCrawlStatus();
    res.json(report);
  });

  app.use((req, res) => {
    res.status(404).json({ error: "not_found", path: req.path });
  });

  return app;
}

export function startServer() {
  const app = createServer();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Continua Scraper listening");
  });
}
