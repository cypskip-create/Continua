import { startEngineMonitorWorker } from "./engineMonitorWorker.js";
import {startOwnedApplicationWorker} from './ownedApplicationWorker.js';
import { startDocumentPublicationWorker } from './documentPublicationWorker.js';
import { serialBootstrap } from './serialBootstrap.js';
import {startResearchRefreshWorker, runResearchRefreshOnce} from './researchRefreshWorker.js';
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
import { logger } from "../monitoring/logger.js";
export async function startAllWorkers() {
    const ownedApplicationTask = startOwnedApplicationWorker();
    const researchRefreshTask = startResearchRefreshWorker();
    const engineMonitorTask = startEngineMonitorWorker();
    const stopPriceWorker = startPriceWorker();
    const stopIndexWorker = startIndexWorker();
    const financialsTask = startFinancialsWorker();
    const corporateActionsTask = startCorporateActionsWorker();
    const candlesTask = startCandlesWorker();
    const announcementsTask = startAnnouncementsWorker();
    const financialCandidatesTask = startFinancialCandidatesWorker();
    const documentPublicationTask = startDocumentPublicationWorker();
    const newsTask = startNewsWorker();
    // Fire the first live-data pass before any expensive bootstrap work. On a
    // warm/production database this refreshes prices within one adapter call;
    // on a new database the follow-up pass below runs after securities exist.
    void Promise.allSettled([
        runPriceIngestionOnce({ respectTradingCalendar: false }),
        runIndexIngestionOnce({ respectTradingCalendar: false }),
        runNewsBridgeOnce(),
    ]).then((results) => {
        results.forEach((result, index) => {
            if (result.status === "rejected") {
                logger.error({ err: result.reason, worker: ["prices", "indices", "news"][index] }, "Initial live-data pass failed");
            }
        });
    });
    // Enrichment is deliberately detached from service readiness. It can take
    // minutes on a cold database and must never delay quotes for app users.
    void (async () => {
        logger.info("Bootstrapping reference data + fundamentals in background…");
        await runFinancialsSyncOnce();
        await serialBootstrap([
            { name: 'actions', run: runCorporateActionsSyncOnce },
            { name: 'announcements', run: runAnnouncementsBridgeOnce },
            { name: 'financial-candidates', run: runFinancialCandidatesBridgeOnce },
            { name: 'news', run: runNewsBridgeOnce },
            { name: 'candles', run: runCandlesBackfillOnce },
        ], (worker, err) => logger.error({ err, worker }, 'Enrichment failed; continuing independent workers'));
        // Populate symbols that could not be priced until financials created
        // their security rows, then compute derived research data.
        await Promise.allSettled([
            runPriceIngestionOnce({ respectTradingCalendar: false }),
            runIndexIngestionOnce({ respectTradingCalendar: false }),
        ]);
        await runResearchRefreshOnce();
        logger.info("Background bootstrap complete");
    })().catch((err) => logger.error({ err }, "Background bootstrap failed"));
    logger.info("All recurring workers started; enrichment continuing in background");
    return () => {
        ownedApplicationTask.stop();
        researchRefreshTask.stop();
        engineMonitorTask.stop();
        stopPriceWorker();
        stopIndexWorker();
        financialsTask.stop();
        corporateActionsTask.stop();
        candlesTask.stop();
        announcementsTask.stop();
        financialCandidatesTask.stop();
        documentPublicationTask.stop();
        newsTask.stop();
    };
}
