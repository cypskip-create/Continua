export interface ExtractionSweepSummary {
    examined: number;
    extracted: number;
    needsReview: number;
    skippedUnsupported: number;
    failed: number;
}
/** Cron and manual triggers share one bounded sweep in this service process. */
export declare function sweepUnextractedArtifacts(limit?: number): Promise<ExtractionSweepSummary>;
