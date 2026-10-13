/**
 * Daily sync of corporate actions, earnings events, and ownership data.
 * Same cadence reasoning as financialsWorker — these are event-driven, not
 * continuous, datasets.
 */
import cron from "node-cron";
import { getAllAdapters } from "../adapters/registry.js";
import { runCorporateActionsIngestion } from "../ingestion/pipelines/corporateActionsIngestionPipeline.js";
import { env } from "../config/index.js";
import { logger } from "../monitoring/logger.js";
const LOOKBACK_DAYS = 7; // re-check a rolling window in case a prior run missed something
export async function runCorporateActionsSyncOnce() {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
    for (const adapter of getAllAdapters()) {
        try {
            const securities = await adapter.listSecurities();
            logger.info({ exchange: adapter.exchange, count: securities.length }, "Running corporate actions sync");
            await runCorporateActionsIngestion(adapter, since, securities.map((s) => s.symbol));
        }
        catch (err) {
            logger.error({ err, exchange: adapter.exchange }, "Corporate actions sync failed");
        }
    }
}
export function startCorporateActionsWorker() {
    logger.info({ cron: env.CORPORATE_ACTIONS_SYNC_CRON }, "Scheduling corporate actions worker");
    return cron.schedule(env.CORPORATE_ACTIONS_SYNC_CRON, () => { void runCorporateActionsSyncOnce(); });
}
if (import.meta.url === `file://${process.argv[1]}`) {
    void runCorporateActionsSyncOnce();
}
