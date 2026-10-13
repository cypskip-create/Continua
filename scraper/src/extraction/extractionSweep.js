/**
 * Closes a real gap in the pipeline: crawler/crawlSource.ts (used by any
 * source whose `adapter` isn't registered in adapters/registry.ts — i.e.
 * every generic source, which is how CMA Kenya, Central Bank of Kenya,
 * KNBS, and individual company investor-relations pages get onboarded)
 * stores raw PDF/HTML bytes for provenance but never runs extraction on
 * them. Only adapter-based sources (nse, rss) get their documents parsed
 * automatically, via runAdapter.ts.
 *
 * This sweep finds raw_artifacts with zero extraction rows, runs the
 * same extractByContentType() logic reprocessArtifact.ts uses for a
 * single named artifact, and inserts the result — so a generic-crawled
 * source's financial PDFs reach scraping.extractions (and from there,
 * the financialStatementCandidatesBridge) the same way an NSE
 * announcement does. Without this, adding a new generic source is
 * silently a no-op past "bytes get stored somewhere".
 *
 * Idempotent by construction: findUnextracted() only returns artifacts
 * with no extraction row yet, so re-running the sweep after a partial
 * failure just picks up where it left off.
 */
import { findUnextracted } from "../storage/extractionsRepository.js";
import { insertExtraction } from "../storage/extractionsRepository.js";
import { readRawArtifact } from "../storage/rawStorage.js";
import { recordDeadLetter } from "../storage/deadLettersRepository.js";
import { extractByContentType } from "./extractByContentType.js";
import { logger } from "../monitoring/logger.js";
const SWEEP_PARSER_VERSION = "extraction-sweep-0.2.0";
let activeSweep;
/** Cron and manual triggers share one bounded sweep in this service process. */
export function sweepUnextractedArtifacts(limit = 50) {
    if (activeSweep)
        return activeSweep;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        return Promise.reject(new Error('Extraction batch size must be 1–100'));
    activeSweep = runSweep(limit).finally(() => { activeSweep = undefined; });
    return activeSweep;
}
async function runSweep(limit) {
    const pending = await findUnextracted(limit);
    const summary = { examined: 0, extracted: 0, needsReview: 0, skippedUnsupported: 0, failed: 0 };
    for (const artifact of pending) {
        summary.examined++;
        try {
            const body = await readRawArtifact(artifact.storagePath);
            const result = await extractByContentType(artifact.contentType, body);
            if (!result) {
                // Not an error — this artifact is a content type extraction
                // doesn't handle (image, CSS, JS, ...). findUnextracted() already
                // filters to pdf/html, so this should be rare, but a source's
                // content-type header can lie.
                summary.skippedUnsupported++;
                continue;
            }
            if ((artifact.contentType ?? '').includes('pdf') && (result.text?.trim().length ?? 0) < 50) {
                throw new Error('PDF extraction produced no usable text; automatic sweep will retry');
            }
            await insertExtraction({
                artifactId: artifact.artifactId,
                method: result.method,
                confidence: result.confidence,
                parserVersion: result.parserVersion ?? SWEEP_PARSER_VERSION,
                text: result.text,
                tables: result.tables,
                // No adapter-time context (company name from a title heuristic,
                // etc.) is available here — same reasoning as reprocessArtifact.ts.
                // Entity resolution for these still happens downstream against
                // the extracted text/title where possible.
                entity: {},
                needsReview: result.needsReview,
            });
            summary.extracted++;
            if (result.needsReview)
                summary.needsReview++;
        }
        catch (err) {
            const reason = String(err.message ?? err);
            logger.warn({ artifactId: artifact.artifactId, sourceId: artifact.sourceId, reason }, "Extraction sweep: artifact failed");
            await recordDeadLetter({ sourceId: artifact.sourceId, url: artifact.documentUrl, stage: "parse", reason });
            summary.failed++;
        }
    }
    logger.info(summary, "Extraction sweep complete");
    return summary;
}
