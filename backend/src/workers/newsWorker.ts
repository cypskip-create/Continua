/**
 * Periodically pulls whatever continua-scraper's RSS adapter has produced
 * into market.news_items. Same pattern as announcementsWorker.ts /
 * financialStatementCandidatesWorker.ts, including the reasoning for why
 * a one-off run uses a dedicated always-runs script instead of
 * self-detection.
 *
 * For a one-off manual run, use scripts/runNewsBridgeOnce.ts.
 */
import cron, { type ScheduledTask } from "node-cron";
import { runNewsBridge } from "../ingestion/pipelines/newsIngestionPipeline.js";
import { env } from "../config/index.js";
import { logger } from "../monitoring/logger.js";
import { newsRepository } from "../storage/repositories/newsRepository.js";
let revalidationCursor = "0";
let running = false;
let readerRefresh: Promise<void> | null = null;
let lastReaderRefreshAt = 0;

/** Only active readers trigger this; it is not a keep-alive timer. Never hold
 * the HTTP news response open for a sleeping collector or publisher crawl. */
export function requestNewsCollection(): void {
  const collector = env.NEWS_SCRAPER_URL ?? (env.NODE_ENV === "production" ? "https://continua-scraper.onrender.com" : undefined);
  if (!collector || readerRefresh || Date.now() - lastReaderRefreshAt < 10 * 60_000) return;
  lastReaderRefreshAt = Date.now();
  readerRefresh = (async () => {
    const response = await fetch(new URL("/news/refresh", collector), { method: "POST", signal: AbortSignal.timeout(65_000) });
    if (!response.ok) throw new Error(`News collector returned HTTP ${response.status}`);
    await response.body?.cancel();
    await runNewsBridgeOnce();
  })().catch(err => logger.warn({ err }, "Reader-triggered news collection failed")).finally(() => { readerRefresh = null; });
}

export async function runNewsBridgeOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const total = { processed: 0, withMentions: 0, withoutMentions: 0, failed: 0 };
    const batchSize = 100;
    for (let batch = 0; batch < 10; batch++) {
      const summary = await runNewsBridge("NSE", batchSize);
      total.processed += summary.processed;
      total.withMentions += summary.withMentions;
      total.withoutMentions += summary.withoutMentions;
      total.failed += summary.failed;
      if (summary.processed < batchSize || summary.failed === summary.processed) break;
    }
    logger.info(total, "News bridge sync complete");
    const repaired = await newsRepository.revalidateBatch(revalidationCursor, 100);
    revalidationCursor = repaired.processed < 100 ? "0" : repaired.lastId;
    logger.info(repaired, "Historical news issuer evidence revalidated");
  } catch (err) {
    logger.error({ err }, "News bridge sync failed");
  } finally {
    running = false;
  }
}

export function startNewsWorker(): ScheduledTask {
  logger.info({ cron: env.NEWS_BRIDGE_CRON }, "Scheduling news bridge worker");
  return cron.schedule(env.NEWS_BRIDGE_CRON, () => { void runNewsBridgeOnce(); });
}
