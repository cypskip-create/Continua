/**
 * Autonomous discovery -> durable queue -> extraction.
 * Claim one document per free worker so queued reports do not expire while
 * waiting behind a long OCR batch. Failed/empty extractions stay retryable.
 */
import { insertExtraction, findLatestExtraction } from "../storage/extractionsRepository.js";
import { enqueueDocuments, claimDocuments, finishDocument } from "../storage/documentJobsRepository.js";
import { recordDeadLetter } from "../storage/deadLettersRepository.js";
import { logger } from "../monitoring/logger.js";
export async function runAdapter(adapter) {
    const summary = {
        adapterId: adapter.id, discovered: 0, fetched: 0, newArtifacts: 0,
        extracted: 0, needsReview: 0, failed: 0,
    };
    const documents = await adapter.discover();
    summary.discovered = documents.length;
    const durable = adapter.persistentBatchSize !== undefined;
    if (durable)
        await enqueueDocuments(adapter.id, documents);
    const pending = [...documents];
    let remaining = durable ? adapter.persistentBatchSize : pending.length;
    const concurrency = Math.max(1, Math.min(adapter.documentConcurrency ?? 1, 8));
    const processNext = async () => {
        for (;;) {
            if (remaining <= 0)
                return;
            remaining--;
            const job = durable ? (await claimDocuments(adapter.id, 1))[0] : undefined;
            const doc = durable ? job?.document : pending.shift();
            if (!doc)
                return;
            let stage = 'fetch';
            try {
                const fetched = await adapter.fetch(doc);
                stage = 'parse';
                summary.fetched++;
                if (fetched.isNewArtifact)
                    summary.newArtifacts++;
                const pdf = (fetched.contentType ?? "").includes("application/pdf") || /\.pdf(?:[?#]|$)/i.test(doc.url);
                const previous = fetched.isNewArtifact ? null : await findLatestExtraction(fetched.artifactId);
                // An empty prior extraction is not successful work and must not
                // permanently suppress retries after a transient parser failure.
                if (previous && (!adapter.parserVersion || previous.parserVersion === adapter.parserVersion) && (!pdf || (previous.text?.trim().length ?? 0) >= 50)) {
                    if (job)
                        await finishDocument(job.id, job.attempts);
                    continue;
                }
                if (!adapter.parse) {
                    if (job)
                        await finishDocument(job.id, job.attempts);
                    continue;
                }
                const parsed = await adapter.parse(fetched);
                if (pdf && (parsed.text?.trim().length ?? 0) < 50) {
                    throw new Error("PDF extraction produced no usable text; document remains retryable");
                }
                await insertExtraction({
                    artifactId: fetched.artifactId, method: parsed.method,
                    confidence: parsed.confidence, parserVersion: parsed.parserVersion ?? adapter.parserVersion ?? "adapter-runner-0.2.0",
                    text: parsed.text, tables: parsed.tables, entity: parsed.entity,
                    needsReview: parsed.needsReview,
                });
                summary.extracted++;
                if (parsed.needsReview)
                    summary.needsReview++;
                if (job)
                    await finishDocument(job.id, job.attempts);
            }
            catch (err) {
                const reason = String(err.message ?? err);
                logger.warn({ url: doc.url, reason }, "Adapter document failed; queue will retry");
                summary.failed++;
                // Recording a dead letter must not prevent releasing the queue lease.
                try {
                    await recordDeadLetter({ sourceId: adapter.id, url: doc.url, stage, reason });
                }
                catch (auditError) {
                    logger.warn({ auditError, url: doc.url }, "Document failure audit unavailable");
                }
                if (job)
                    await finishDocument(job.id, job.attempts, reason);
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, remaining) }, processNext));
    logger.info(summary, "Adapter run complete");
    return summary;
}
