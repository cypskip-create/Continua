import type { Extraction, ExtractionMethod } from "../types.js";
export interface NewExtraction {
    artifactId: number;
    method: ExtractionMethod;
    confidence: number | null;
    parserVersion: string;
    text: string | null;
    tables?: unknown[];
    entity?: Record<string, unknown>;
    needsReview: boolean;
}
/**
 * Always inserts a new row rather than updating in place — reprocessing
 * an artifact with a newer parser version (§45) should leave the old
 * extraction visible for comparison, not silently overwrite it.
 */
export declare function insertExtraction(input: NewExtraction): Promise<Extraction>;
export interface UnextractedArtifact {
    artifactId: number;
    sourceId: string;
    adapter: string;
    contentType: string | null;
    storagePath: string;
    documentUrl: string;
}
/**
 * Artifacts with no usable extraction yet (including legacy empty PDFs) — distinct from
 * listNeedsReview() below, which is about extractions that ran but came
 * back low-confidence. This is for artifacts that never got a chance to
 * run successfully: today that's every raw_artifact stored via the generic crawler
 * (crawler/crawlSource.ts stores bytes for provenance but doesn't invoke
 * extraction itself — only the adapter-based runAdapter.ts path does).
 * extractionSweep.ts uses this to catch generic-crawled PDFs/HTML up
 * with the same extraction adapter-based sources already get for free.
 */
export declare function findUnextracted(limit?: number): Promise<UnextractedArtifact[]>;
export declare function findLatestExtraction(artifactId: number): Promise<Extraction | null>;
export interface NeedsReviewItem extends Extraction {
    title: string | null;
    documentUrl: string;
    sourceId: string;
}
/**
 * Review queue (§39): the latest extraction per artifact where THAT
 * latest extraction still needs review — an artifact that was
 * successfully reprocessed after an earlier low-confidence attempt
 * should drop off this list, not linger because of its stale history.
 */
export declare function listNeedsReview(limit?: number): Promise<NeedsReviewItem[]>;
