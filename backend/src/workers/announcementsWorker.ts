/**
 * Periodically pulls whatever continua-scraper has produced in the
 * `scraping` schema into market.company_announcements. Runs independently
 * of the scraper itself — this worker doesn't crawl anything, it just
 * catches up on new extractions on a schedule, same pattern as
 * corporateActionsWorker.
 *
 * For a one-off manual run (e.g. testing), use
 * scripts/runAnnouncementsBridgeOnce.ts instead of invoking this file
 * directly — a `process.argv[1]`/`import.meta.url` self-detection guard
 * was tried here first and is unreliable across platforms (breaks
 * differently depending on OS path formatting, and even the fixed
 * version proved fragile in practice). A dedicated script that
 * unconditionally runs is simpler and doesn't depend on any of that.
 */
import cron, { type ScheduledTask } from "node-cron";
import { runAnnouncementsBridge } from "../ingestion/pipelines/announcementsIngestionPipeline.js";
import { env } from "../config/index.js";
import { logger } from "../monitoring/logger.js";

export async function runAnnouncementsBridgeOnce(): Promise<void> {
  try {
    const total = { processed: 0, resolved: 0, unresolved: 0, failed: 0 };
    const batchSize = 100;
    for (let batch = 0; batch < 10; batch++) {
      const summary = await runAnnouncementsBridge("NSE", batchSize);
      total.processed += summary.processed;
      total.resolved += summary.resolved;
      total.unresolved += summary.unresolved;
      total.failed += summary.failed;
      if (summary.processed < batchSize || summary.failed === summary.processed) break;
    }
    logger.info(total, "Announcements bridge sync complete");
  } catch (err) {
    logger.error({ err }, "Announcements bridge sync failed");
  }
}

export function startAnnouncementsWorker(): ScheduledTask {
  logger.info({ cron: env.ANNOUNCEMENTS_BRIDGE_CRON }, "Scheduling announcements bridge worker");
  return cron.schedule(env.ANNOUNCEMENTS_BRIDGE_CRON, () => { void runAnnouncementsBridgeOnce(); });
}
