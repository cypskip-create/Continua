import type { PoolClient } from 'pg';
import type { FinancialStatementCandidate } from "../../types/market.js";
export declare const financialStatementCandidatesRepository: {
    /**
     * Upsert keyed on (scraped_extraction_id, table_index) — idempotent, same
     * requirement as the announcements bridge (§44: re-running must not
     * duplicate). Always inserts as 'pending'; never overwrites a status a
     * human has already set on a re-run (ON CONFLICT only refreshes the
     * detection fields, not the review state).
     */
    upsert(input: {
        companyId: string | null;
        securityId: string | null;
        rawCompanyName: string | null;
        source: string;
        exchange: string;
        documentUrl: string;
        documentTitle: string | null;
        tableIndex: number;
        detectedTable: unknown;
        detectionConfidence: number | null;
        scrapedArtifactId: number | null;
        scrapedExtractionId: number;
    }, transaction?: PoolClient): Promise<void>;
    listPending(limit?: number): Promise<FinancialStatementCandidate[]>;
    getById(id: string): Promise<FinancialStatementCandidate | null>;
    existsForExtractionTable(scrapedExtractionId: number, tableIndex: number): Promise<boolean>;
    /** Marks a candidate reviewed — 'confirmed' also records which real
     *  financial_periods row it produced, closing the provenance loop from
     *  raw scrape to live figure. */
    markReviewed(id: string, status: "confirmed" | "rejected", note: string | null, resultingPeriodId: string | null): Promise<void>;
};
