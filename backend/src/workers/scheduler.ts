/**
 * Live prices are the latency-critical path. Start their recurring workers
 * and first ingestion immediately; do not hold them behind slow candle,
 * filing, or scraper backfills. The enrichment bootstrap still preserves
 * its own FK ordering and performs a second price pass after reference data
 * is present, which covers a genuinely empty database.
 */
import { runFinancialsSyncOnce, startFinancialsWorker } from "./financialsWorker.js";
import { runCorporateActionsSyncOnce, startCorporateActionsWorker } from "./corporateActionsWorker.js";
import { runCandlesBackfillOnce, startCandlesWorker } from "./candlesWorker.js";
import { runPriceIngestionOnce, startPriceWorker } from "./priceWorker.js";
import { runIndexIngestionOnce, startIndexWorker } from "./indexWorker.js";
import { runAnnouncementsBridgeOnce, startAnnouncementsWorker } from "./announcementsWorker.js";
import { runFinancialCandidatesBridgeOnce, startFinancialCandidatesWorker } from "./financialStatementCandidatesWorker.js";
import { runNewsBridgeOnce, startNewsWorker } from "./newsWorker.js";
import { researchService } from "../services/research/researchService.js";
import { ACTIVE_EXCHANGES } from "../config/index.js";
import { logger } from "../monitoring/logger.js";

export async function startAllWorkers(): Promise<() => void> {
  const stopPriceWorker = startPriceWorker();
  const stopIndexWorker = startIndexWorker();
  const financialsTask = startFinancialsWorker();
  const corporateActionsTask = startCorporateActionsWorker();
  const candlesTask = startCandlesWorker();
  const announcementsTask = startAnnouncementsWorker();
  const financialCandidatesTask = startFinancialCandidatesWorker();
  const newsTask = startNewsWorker();

  // Fire the first live-data pass before any expensive bootstrap work. On a
  // warm/production database this refreshes prices within one adapter call;
  // on a new database the follow-up pass below runs after securities exist.
  void Promise.allSettled([
    runPriceIngestionOnce({ respectTradingCalendar: false }),
    runIndexIngestionOnce({ respectTradingCalendar: false }),
  ]).then((results) => {
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        logger.error({ err: result.reason, worker: index === 0 ? "prices" : "indices" }, "Initial live-data pass failed");
      }
    });
  });

  // Enrichment is deliberately detached from service readiness. It can take
  // minutes on a cold database and must never delay quotes for app users.
  void (async () => {
    logger.info("Bootstrapping reference data + fundamentals in background…");
    await runFinancialsSyncOnce();

    const enrichment = await Promise.allSettled([
      runCorporateActionsSyncOnce(),
      runCandlesBackfillOnce(),
      runAnnouncementsBridgeOnce(),
      runFinancialCandidatesBridgeOnce(),
      runNewsBridgeOnce(),
    ]);
    enrichment.forEach((result, index) => {
      if (result.status === "rejected") logger.error({ err: result.reason, worker: ["actions", "candles", "announcements", "financial-candidates", "news"][index] }, "Enrichment failed; continuing independent workers");
    });

    // Populate symbols that could not be priced until financials created
    // their security rows, then compute derived research data.
    await Promise.allSettled([
      runPriceIngestionOnce({ respectTradingCalendar: false }),
      runIndexIngestionOnce({ respectTradingCalendar: false }),
    ]);
    for (const exchange of ACTIVE_EXCHANGES) {
      try { await researchService.recomputeAllForExchange(exchange); }
      catch (err) { logger.error({ err, exchange }, "Research recompute failed"); }
    }
    logger.info("Background bootstrap complete");
  })().catch((err) => logger.error({ err }, "Background bootstrap failed"));

  logger.info("All recurring workers started; enrichment continuing in background");
  return () => {
    stopPriceWorker();
    stopIndexWorker();
    financialsTask.stop();
    corporateActionsTask.stop();
    candlesTask.stop();
    announcementsTask.stop();
    financialCandidatesTask.stop();
    newsTask.stop();
  };
}
