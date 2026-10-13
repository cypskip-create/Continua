/**
 * News RSS uses NEWS_CRAWL_CRON; all other sources retain their own cron
 * expressions. A source with an
 * adapter registered in adapters/registry.ts runs via that adapter's
 * discover->fetch->parse pipeline; anything else falls back to the
 * generic crawler (crawler/crawlSource.ts).
 *
 * Node-cron, not a distributed job queue — this service runs as a single
 * instance (see rateLimiter.ts's header comment for the same tradeoff).
 * Revisit if this ever needs to run as multiple replicas.
 */
import cron from "node-cron";
import { listEnabledSources, getSource } from "../storage/sourcesRepository.js";
import { crawlSource } from "../crawler/crawlSource.js";
import { hasRegisteredAdapter, runRegisteredAdapter } from "../adapters/registry.js";
import { sweepUnextractedArtifacts } from "../extraction/extractionSweep.js";
import { env } from "../config/index.js";
import { logger } from "../monitoring/logger.js";
import { ensureDefaultSources } from "../config/defaultSources.js";
import { sourceSchedule } from "./newsSchedule.js";
const scheduledTasks = [];
const runningSources = new Set();
const newsRuns = new Map();
let newsRefresh = null;
let lastNewsRefreshAt = 0;
let indexRefresh = null;
let lastIndexRefreshAt = 0;
let documentRefresh = null;
let lastDocumentRefreshAt = 0;
/** A real financial-page read can wake the free collector. This is bounded
 * catch-up, not an always-on keepalive or arbitrary URL-fetch endpoint. */
export function refreshFinancialDocuments() {
    if (documentRefresh)
        return documentRefresh;
    if (!env.SCHEDULER_ENABLED || Date.now() - lastDocumentRefreshAt < 10 * 60_000)
        return Promise.resolve();
    lastDocumentRefreshAt = Date.now();
    documentRefresh = (async () => {
        const source = await getSource('kenyanstocks');
        if (source?.enabled && source.redistributionAllowed === true)
            await runSourceOnce(source, true);
    })().finally(() => { documentRefresh = null; });
    return documentRefresh;
}
/** Active readers can wake a sleeping free collector, without keep-alive timers
 * or bypassing source enablement, licensing, robots or revisit throttles. */
export function refreshIndexSource() {
    if (indexRefresh)
        return indexRefresh;
    if (!env.SCHEDULER_ENABLED || Date.now() - lastIndexRefreshAt < 15 * 60_000)
        return Promise.resolve();
    lastIndexRefreshAt = Date.now();
    indexRefresh = (async () => { const source = await getSource('nse-index-summary'); if (source?.enabled)
        await runSourceOnce(source); })().finally(() => { indexRefresh = null; });
    return indexRefresh;
}
/** Reader-triggered catch-up shares the cron locks and publisher throttles. */
export function refreshNewsSources() {
    if (newsRefresh)
        return newsRefresh;
    if (!env.SCHEDULER_ENABLED || Date.now() - lastNewsRefreshAt < 10 * 60_000)
        return Promise.resolve();
    lastNewsRefreshAt = Date.now();
    newsRefresh = (async () => {
        const pending = (await listEnabledSources()).filter(source => source.adapter === "rss");
        await Promise.all(Array.from({ length: Math.min(2, pending.length) }, async () => {
            for (;;) {
                const source = pending.shift();
                if (!source)
                    return;
                await runSourceOnce(source);
            }
        }));
    })().finally(() => { newsRefresh = null; });
    return newsRefresh;
}
export function newsScheduleStatus() {
    return { enabled: env.SCHEDULER_ENABLED, cron: env.NEWS_CRAWL_CRON, running: [...runningSources].filter(id => newsRuns.has(id)), sources: [...newsRuns].map(([sourceId, state]) => ({ sourceId, ...state })) };
}
async function runSourceOnce(source, drainOnly = false) {
    // A slow publisher must not accumulate another crawl every cron tick.
    if (runningSources.has(source.id))
        return;
    runningSources.add(source.id);
    if (source.adapter === "rss")
        newsRuns.set(source.id, { startedAt: new Date().toISOString(), completedAt: null, success: null });
    try {
        if (hasRegisteredAdapter(source.adapter)) {
            const summary = await runRegisteredAdapter(source, { drainOnly, batchSize: env.DOCUMENT_DRAIN_BATCH_SIZE });
            if (source.adapter === "rss")
                newsRuns.set(source.id, { ...newsRuns.get(source.id), completedAt: new Date().toISOString(), success: summary.failed === 0 && summary.discovered > 0, discovered: summary.discovered, extracted: summary.extracted });
            logger.info({ sourceId: source.id, ...summary }, "Scheduled adapter run complete");
        }
        else {
            const summary = await crawlSource(source.id);
            logger.info(summary, "Scheduled crawl complete");
        }
    }
    catch (err) {
        if (source.adapter === "rss")
            newsRuns.set(source.id, { ...newsRuns.get(source.id), completedAt: new Date().toISOString(), success: false });
        logger.error({ sourceId: source.id, err }, "Scheduled run failed");
    }
    finally {
        runningSources.delete(source.id);
    }
}
/**
 * Loads all enabled sources and schedules each on its own cron
 * expression. Call once at service startup. Returns the list of
 * scheduled tasks so they can be stopped (e.g. in tests or graceful
 * shutdown) — node-cron has no global "stop everything" method.
 */
export async function startScheduler() {
    if (!env.SCHEDULER_ENABLED) {
        logger.info("Scheduler disabled via SCHEDULER_ENABLED=false");
        return [];
    }
    await ensureDefaultSources();
    const sources = await listEnabledSources();
    // Discovery retains its publisher schedule. Already queued documents do
    // not wait another six hours for the next archive crawl.
    if (cron.validate(env.DOCUMENT_DRAIN_CRON)) {
        scheduledTasks.push(cron.schedule(env.DOCUMENT_DRAIN_CRON, () => {
            void (async () => {
                const queuedSources = (await listEnabledSources()).filter(source => ['nse', 'kenyanstocks', 'afx'].includes(source.adapter));
                for (const source of queuedSources)
                    await runSourceOnce(source, true);
            })().catch(err => logger.error({ err }, 'Automatic document queue drain failed; next tick will retry'));
        }));
        logger.info({ cron: env.DOCUMENT_DRAIN_CRON, batchSize: env.DOCUMENT_DRAIN_BATCH_SIZE }, 'Scheduled independent document queue processing');
    }
    else
        logger.warn('Invalid DOCUMENT_DRAIN_CRON; automatic queue drain is not scheduled');
    for (const source of sources) {
        const cronExpression = sourceSchedule(source, env.NEWS_CRAWL_CRON, env.DEFAULT_CRAWL_CRON);
        if (!cron.validate(cronExpression)) {
            logger.warn({ sourceId: source.id, cronExpression }, "Invalid cron expression for source — skipping schedule");
            continue;
        }
        const task = cron.schedule(cronExpression, () => {
            void runSourceOnce(source);
        });
        scheduledTasks.push(task);
        logger.info({ sourceId: source.id, adapter: source.adapter, cronExpression }, "Scheduled source");
    }
    // Do not wait up to six hours for the first content. Run each source once
    // at startup with bounded source-level concurrency; per-host throttling
    // and each adapter's document concurrency still apply underneath.
    void (async () => {
        // Publish fresh news before spending minutes on historical PDFs/OCR.
        const priority = (s) => s.id === 'nse-index-summary' ? 2 : s.adapter === 'rss' ? 1 : 0;
        const pending = [...sources].sort((a, b) => priority(b) - priority(a));
        const workers = Array.from({ length: Math.min(2, pending.length) }, async () => {
            for (;;) {
                const source = pending.shift();
                if (!source)
                    return;
                await runSourceOnce(source);
            }
        });
        await Promise.all(workers);
        await sweepUnextractedArtifacts(env.EXTRACTION_SWEEP_BATCH_SIZE);
        logger.info({ sourceCount: sources.length }, "Initial source crawl complete");
    })().catch((err) => logger.error({ err }, "Initial source crawl failed"));
    // Independent of any one source: catches up generic-crawled artifacts
    // (every source without a registered adapter — see registry.ts) that
    // crawlSource.ts stored but never extracted. Runs regardless of which
    // sources are configured, so it doesn't need its own per-source setup.
    if (cron.validate(env.EXTRACTION_SWEEP_CRON)) {
        const sweepTask = cron.schedule(env.EXTRACTION_SWEEP_CRON, () => {
            void sweepUnextractedArtifacts(env.EXTRACTION_SWEEP_BATCH_SIZE).catch((err) => logger.error({ err }, "Scheduled extraction sweep failed"));
        });
        scheduledTasks.push(sweepTask);
        logger.info({ cronExpression: env.EXTRACTION_SWEEP_CRON }, "Scheduled extraction sweep");
    }
    else {
        logger.warn({ cronExpression: env.EXTRACTION_SWEEP_CRON }, "Invalid EXTRACTION_SWEEP_CRON — extraction sweep not scheduled");
    }
    return scheduledTasks;
}
export function stopScheduler() {
    for (const task of scheduledTasks)
        task.stop();
    scheduledTasks.length = 0;
}
