import type { ComputedRatios, AfriScoreResult } from "../../types/market.js";
type ResearchResult = {
    ratios: ComputedRatios;
    score: AfriScoreResult;
} | null;
export declare const researchService: {
    /** Recomputes ratios + AfriScore for a security from whatever's currently
     *  stored (latest financials, price history, dividends) and persists both.
     *  Called after fundamentals ingestion, and can be called on-demand by
     *  the API for a cache-miss. */
    recomputeAndStore(securityId: string, currentPrice: number): Promise<{
        ratios: ComputedRatios;
        score: AfriScoreResult;
    } | null>;
    computeAndStore(securityId: string, currentPrice: number): Promise<ResearchResult>;
    getRatios(securityId: string): Promise<ComputedRatios | null>;
    getAfriScore(securityId: string): Promise<AfriScoreResult | null>;
    /** Computes ratios + AfriScore for every security on an exchange. Run once
     *  at bootstrap (after the first price pass, so every symbol has a quote
     *  to compute against) so the screener and research endpoints are
     *  populated for the whole universe immediately — not just for whichever
     *  symbols happen to get queried first. */
    recomputeAllForExchange(exchange: string): Promise<{
        computed: number;
        skipped: number;
        failed: number;
        pending: number;
    }>;
};
export {};
