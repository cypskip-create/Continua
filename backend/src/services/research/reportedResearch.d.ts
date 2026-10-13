import type { FinancialRow } from './engineAnalytics.js';
export declare function reportedResearchRatios(securityId: string, quote: {
    lastPrice: number;
    timestamp: string;
    source?: string;
} | null, history: FinancialRow[], dividendPerShare: number | null, now?: Date): {
    securityId: string;
    asOf: string;
    pe: number | undefined;
    pb: number | undefined;
    ps: number | undefined;
    dividendYield?: number | undefined;
    evEbitda?: number | undefined;
    roe?: number | undefined;
    roa?: number | undefined;
    roic?: number | undefined;
    grossMargin?: number | undefined;
    operatingMargin?: number | undefined;
    netMargin?: number | undefined;
    payoutRatio?: number | undefined;
    currentRatio?: number | undefined;
    debtToEquity?: number | undefined;
    interestCoverage?: number | undefined;
    priceMomentum3m?: number | undefined;
    volatility90d?: number | undefined;
} | null;
