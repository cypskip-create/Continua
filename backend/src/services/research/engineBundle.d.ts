import type { ExchangeCode } from "../../config/index.js";
import type {AfriScoreResult} from '../../types/market.js';
export declare function getEngineBundle(symbol: string, exchange: ExchangeCode): Promise<{
    refresh: {
        state: string;
        failedSections: string[];
        attemptedAt: string;
    };
    reliability: {
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
    diagnostics: {
        trends: {
            year: number;
            netMargin: number | null;
            roe: number | null;
            cashConversion: number | null;
            accrualsToAssets: number | null;
            sourceUrls: string[];
            reportedAt: string | null;
        }[];
        checks: {
            id: string;
            label: string;
            result: "pass" | "flag" | "unknown";
            reason: string;
        }[];
        knownChecks: number;
        totalChecks: number;
        evidence: {
            year: number;
            field: string;
            value: number;
            periodEnd: string | null;
            availableAt: string | null;
            sourceUrls: string[];
            basis: string;
        }[];
        methodology: string;
    };
    quality: {
        quoteAsOf: string | null;
        quoteSource: string | null;
        periodEnd: string | null;
        filedAt: string | null;
        financialCoverage: {
            years: number[];
            missingYears: number[];
            sourceBackedYears: number[];
        };
        warnings: string[];
        priceAdjustmentBasis: string;
    };
    financialAnalysis: {
        period: number | null;
        metrics: {
            revenueGrowth: number | null;
            earningsGrowth: number | null;
            dilution: number | null;
            cashConversion: number | null;
            freeCashFlowMargin: number | null;
            debtToEquity: number | null;
            currentRatio: number | null;
            returnOnAssets: number | null;
        };
        findings: string[];
        sectorNote: string;
        missing: string[];
    };
    changes: {
        fingerprint: string;
        comparedAsOf: Date | null;
        baseline: boolean;
        changes: {
            topic: string;
            text: string;
            material: boolean;
        }[];
    };
    scenarios: {
        name: string;
        growthPercent: number;
        revenue: number | null;
        netIncome: number | null;
        assumption: string;
    }[];
    dividendAnalysis: {
        trailingDps: number | null;
        payoutRatio: number | null;
        coverage: number | null;
        events: import("../../types/market.js").CorporateAction[];
    };
    quarterly: any[];
    actions: import("../../types/market.js").CorporateAction[];
    sector: string | null;
    synthesis: {
        observations: {
            topic: string;
            text: string;
            asOf: string | null;
        }[];
        checklist: {
            topic: string;
            text: string;
            asOf: null;
        }[];
        methodology: string;
    };
    symbol: string;
    exchange: "NSE";
    currency: import("../../types/market.js").Currency;
    companyName: string;
    unavailable: string[];
    generatedAt: string;
    quote: import("../../types/market.js").Quote | null;
    history: any[];
    earnings: import("../../types/market.js").EarningsEvent[];
    ownership: import("../../types/market.js").OwnershipRecord[];
    valuation: import("../../services/technical/valuationService.js").ValuationResult | null;
    ratios: {
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
    score: AfriScoreResult | null;
    news: {
        source: string;
        url: string;
        publishedAt: string | null;
        impact: {
            topic: string;
            reason: string;
            symbols: string[];
            methodology: string;
        } | null | undefined;
        summary: string;
        methodology: string;
        fullTextAvailable: boolean;
        id: string;
        headline: string;
    }[];
    technicals: import("../technical/indicatorsService.js").IndicatorResult[];
    briefing: {
        title: string;
        methodology: string;
        facts: string[];
        strengths: string[];
        risks: string[];
        coverage: string;
    };
    estimates: import("../../types/market.js").EarningsEvent[];
    coverage: {
        annualPeriods: number;
        earningsEvents: number;
        shareholderDisclosures: number;
        valuationModels: number;
        analystEstimates: number;
        insiderTransactions: boolean;
        orderDepth: boolean;
        optionsData: boolean;
    };
}>;
