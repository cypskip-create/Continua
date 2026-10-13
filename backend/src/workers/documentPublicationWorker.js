import cron from 'node-cron';
import { runAutomaticDocumentPublication } from '../ingestion/pipelines/automaticDocumentPublication.js';
import { env } from '../config/index.js';
import { logger } from '../monitoring/logger.js';
/** Validation is independent of heuristic candidate generation and live quotes.
 * The pipeline owns the single-flight/advisory locks and versioned audit. */
export async function runDocumentPublicationOnce() {
    try {
        await runAutomaticDocumentPublication(env.DOCUMENT_PUBLICATION_BATCH_SIZE);
    }
    catch (err) {
        logger.error({ err }, 'Automatic document publication failed; next scheduled tick will retry');
    }
}
export function startDocumentPublicationWorker() {
    logger.info({ cron: env.DOCUMENT_PUBLICATION_CRON, batchSize: env.DOCUMENT_PUBLICATION_BATCH_SIZE }, 'Scheduling automatic document validation and publication');
    const task = cron.schedule(env.DOCUMENT_PUBLICATION_CRON, () => { void runDocumentPublicationOnce(); });
    void runDocumentPublicationOnce();
    return task;
}
