/**
 * Boot sequence for all background processing. Order matters:
 *   1. Reference data + fundamentals (securities/companies must exist
 *      before anything else can reference them via foreign key).
 *   2. Corporate actions + candle backfill (depend on securities existing).
 *   3. One synchronous price pass, so every symbol has a live quote.
 *   4. Research (ratios + AfriScore) computed for the whole universe, now
 *      that both fundamentals AND a price exist for every symbol — this is
 *      what makes the screener populated immediately instead of only for
 *      whichever symbols happen to get queried first.
 *   5. THEN start the recurring interval/cron workers for ongoing updates.
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
  logger.info("Bootstrapping reference data + fundamentals…");
  await runFinancialsSyncOnce();
  await runCorporateActionsSyncOnce();
  await runCandlesBackfillOnce();

  // Scraper bridges — catch up on whatever continua-scraper has already
  // produced in `scraping.*` as of boot, same "one synchronous pass, then
  // recurring cron" shape as the rest of bootstrap. Placed after
  // runFinancialsSyncOnce/runCorporateActionsSyncOnce since entity
  // resolution needs market.companies/securities to already exist.
  logger.info("Running first scraper-bridge pass (announcements + financial statement candidates + news)…");
  await runAnnouncementsBridgeOnce();
  await runFinancialCandidatesBridgeOnce();
  await runNewsBridgeOnce();

  logger.info("Running first price pass so every symbol has a live quote…");
  // respectTradingCalendar: false — bootstrap needs at least one quote to
  // exist regardless of whether NSE happens to be open at deploy time
  // (e.g. deploying at night, or in mock mode where "trading hours" don't
  // reflect anything real anyway). The recurring interval below DOES
  // respect market hours.
  await runPriceIngestionOnce({ respectTradingCalendar: false });

  logger.info("Running first index pass…");
  await runIndexIngestionOnce({ respectTradingCalendar: false });

  logger.info("Computing research (ratios + AfriScore) for the full universe…");
  for (const exchange of ACTIVE_EXCHANGES) {
    await researchService.recomputeAllForExchange(exchange);
  }

  const stopPriceWorker = startPriceWorker();
  const stopIndexWorker = startIndexWorker();
  const financialsTask = startFinancialsWorker();
  const corporateActionsTask = startCorporateActionsWorker();
  const candlesTask = startCandlesWorker();
  const announcementsTask = startAnnouncementsWorker();
  const financialCandidatesTask = startFinancialCandidatesWorker();
  const newsTask = startNewsWorker();

  logger.info("All workers started");
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