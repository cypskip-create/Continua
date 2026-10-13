import type { FinancialRow } from './engineAnalytics.js';
export declare const RESEARCH_METHOD_VERSION = "nse-research-2026-10-v1";
type QuoteInput = {
    lastPrice: number;
    timestamp: string;
    source?: string;
} | null;
export declare function researchReadiness(input: {
    quote: QuoteInput;
    history: FinancialRow[];
    unavailable: string[];
    technicalObservations: number;
    estimateCount: number;
    ownershipCount: number;
}, now?: Date): {
    methodVersion: string;
    snapshotId: string;
    status: string;
    issues: {
        id: string;
        severity: "warning" | "blocked";
        message: string;
        nextTool: string;
    }[];
    matrix: {
        year: number;
        periodEnd: string | null;
        availableAt: string | null;
        sourceCount: number;
        fields: {
            revenue: boolean;
            earnings: boolean;
            eps: boolean;
            assets: boolean;
            cashFlow: boolean;
        };
        usable: boolean;
    }[];
    gaps: number[];
    capabilities: {
        id: string;
        label: string;
        status: "unavailable" | "available" | "limited";
        observed: number;
        needed: number;
        reason: string;
    }[];
    quoteAsOf: string | null;
    methodology: string;
};
export {};
