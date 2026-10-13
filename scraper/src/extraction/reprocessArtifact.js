/**
 * Reprocessing (§45): re-run extraction against an already-stored
 * artifact using the CURRENT parser code, without re-downloading. Useful
 * after fixing a bug in extraction logic (exactly the kind of bug this
 * project has hit repeatedly — the pdf.js DataCloneError, the gzip
 * decompression issue, the table-heuristic false positives) — those
 * fixes only help documents crawled AFTER the fix unless there's a way
 * to reprocess what's already stored.
 *
 * Always inserts a NEW extraction row (insertExtraction never updates in
 * place — see that module's comment) so the old, buggy extraction stays
 * visible for comparison rather than silently vanishing.
 *
 * The actual per-content-type extraction work lives in
 * extractByContentType.ts, shared with extractionSweep.ts — this module
 * is just "look up one named artifact, extract it, insert the row".
 */
import { findById } from "../storage/rawArtifactsRepository.js";
import { readRawArtifact } from "../storage/rawStorage.js";
import { insertExtraction } from "../storage/extractionsRepository.js";
import { extractByContentType } from "./extractByContentType.js";
const REPROCESS_RUNNER_VERSION = "reprocess-0.2.0";
export async function reprocessArtifact(artifactId) {
    const artifact = await findById(artifactId);
    if (!artifact)
        throw new Error(`No raw_artifact found with id ${artifactId}`);
    const body = await readRawArtifact(artifact.storagePath);
    const result = await extractByContentType(artifact.contentType, body);
    if (!result) {
        throw new Error(`Reprocessing not supported for content type: ${artifact.contentType ?? "unknown"}`);
    }
    return insertExtraction({
        artifactId,
        method: result.method,
        confidence: result.confidence,
        parserVersion: result.parserVersion ?? REPROCESS_RUNNER_VERSION,
        text: result.text,
        tables: result.tables,
        // reprocessing doesn't have the original discover()-time context
        // (e.g. NSE's title-heuristic company name) — left unresolved rather
        // than fabricated.
        entity: {},
        needsReview: result.needsReview,
    });
}
