import type { ComputedRatios, AfriScoreResult } from "../../types/market.js";
export declare const scoresRepository: {
    upsertRatios(r: ComputedRatios): Promise<void>;
    getRatios(securityId: string): Promise<ComputedRatios | null>;
    upsertAfriScore(s: AfriScoreResult): Promise<void>;
    upsertResearchSnapshot(ratios: ComputedRatios, score: AfriScoreResult): Promise<boolean>;
    getAfriScore(securityId: string): Promise<AfriScoreResult | null>;
    /** Fresh reported-annual sector P/E, optionally on the target fiscal year.
     * Reviewed financials in production, active peers and quotes <=7 days old.
     * The legacy dividend-yield field is unavailable rather than populated
     * from an unrelated cached-ratio snapshot. */
    getSectorAverageRatios(exchange: string, sectorId: string, excludeSecurityId: string, fiscalYear?: number): Promise<{
        avgPe: number | null;
        avgDividendYield: number | null;
        sampleSize: number;
    }>;
};
