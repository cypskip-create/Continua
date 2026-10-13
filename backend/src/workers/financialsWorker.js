/**
 * Daily sync of fundamentals (income statement, balance sheet, cash flow)
 * for every symbol on every registered exchange. Financials don't change
 * intraday, so this runs on a cron, not a poll loop — see FINANCIALS_SYNC_CRON.
 */
import cron from "node-cron";
import { getAllAdapters } from "../adapters/registry.js";
import { runFundamentalsIngestion } from "../ingestion/pipelines/fundamentalsIngestionPipeline.js";
import { env } from "../config/index.js";
import { logger } from "../monitoring/logger.js";
export async function runFinancialsSyncOnce() {
    for (const adapter of getAllAdapters()) {
        try {
            const securities = await adapter.listSecurities();
            logger.info({ exchange: adapter.exchange, count: securities.length }, "Running financials sync");
            await runFundamentalsIngestion(adapter, securities.map((s) => s.symbol));
        }
        catch (err) {
            logger.error({ err, exchange: adapter.exchange }, "Financials sync failed");
        }
    }
}
export function startFinancialsWorker() {
    logger.info({ cron: env.FINANCIALS_SYNC_CRON }, "Scheduling financials worker");
    return cron.schedule(env.FINANCIALS_SYNC_CRON, () => { void runFinancialsSyncOnce(); });
}
if (import.meta.url === `file://${process.argv[1]}`) {
    void runFinancialsSyncOnce();
}
