/**
 * Periodically pulls whatever continua-scraper has detected as financial
 * tables into market.financial_statement_candidates for review. Runs
 * independently of the scraper itself, same pattern as
 * announcementsWorker.ts (including the same reasoning for why a one-off
 * run uses a dedicated always-runs script instead of self-detection).
 *
 * For a one-off manual run, use scripts/runFinancialCandidatesBridgeOnce.ts.
 */
import cron, { type ScheduledTask } from "node-cron";
import { runFinancialStatementCandidatesBridge } from "../ingestion/pipelines/financialStatementCandidatesBridge.js";
import { env } from "../config/index.js";
import { logger } from "../monitoring/logger.js";

export async function runFinancialCandidatesBridgeOnce(): Promise<void> {
  try {
    const total = { extractionsProcessed: 0, candidatesCreated: 0, resolved: 0, unresolved: 0, failed: 0 };
    const batchSize = 100;
    for (let batch = 0; batch < 10; batch++) {
      const summary = await runFinancialStatementCandidatesBridge("NSE", batchSize);
      total.extractionsProcessed += summary.extractionsProcessed;
      total.candidatesCreated += summary.candidatesCreated;
      total.resolved += summary.resolved;
      total.unresolved += summary.unresolved;
      total.failed += summary.failed;
      if (summary.extractionsProcessed < batchSize || summary.failed === summary.extractionsProcessed) break;
    }
    logger.info(total, "Financial statement candidates bridge sync complete");
  } catch (err) {
    logger.error({ err }, "Financial statement candidates bridge sync failed");
  }
}

export function startFinancialCandidatesWorker(): ScheduledTask {
  logger.info({ cron: env.FINANCIAL_CANDIDATES_BRIDGE_CRON }, "Scheduling financial statement candidates bridge worker");
  return cron.schedule(env.FINANCIAL_CANDIDATES_BRIDGE_CRON, () => { void runFinancialCandidatesBridgeOnce(); });
}
