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

export async function runNewsBridgeOnce(): Promise<void> {
  try {
    const summary = await runNewsBridge();
    logger.info(summary, "News bridge sync complete");
  } catch (err) {
    logger.error({ err }, "News bridge sync failed");
  }
}

export function startNewsWorker(): ScheduledTask {
  logger.info({ cron: env.NEWS_BRIDGE_CRON }, "Scheduling news bridge worker");
  return cron.schedule(env.NEWS_BRIDGE_CRON, () => { void runNewsBridgeOnce(); });
}