import type { ExchangeCode } from "../../config/index.js";
export declare function getPortfolioOverview(userId: string, exchange: ExchangeCode): Promise<{
    exchange: "NSE";
    currency: string | null;
    totalCost: number | null;
    unrealized: number | null;
    sessionPnl: number | null;
    sessionDate: string | null | undefined;
    holdingCount: number;
    pricedCount: number;
    warnings: string[];
    methodology: string;
    generatedAt: string;
    available: boolean;
    reason: string;
    positions: never[];
    sectors: never[];
    totalValue: number;
    coverage: string;
} | {
    exchange: "NSE";
    currency: string | null;
    totalCost: number | null;
    unrealized: number | null;
    sessionPnl: number | null;
    sessionDate: string | null | undefined;
    holdingCount: number;
    pricedCount: number;
    warnings: string[];
    methodology: string;
    generatedAt: string;
    available: boolean;
    reason: null;
    positions: {
        value: number;
        weight: number;
        sessionContribution: number | null;
        participation: number | null;
        symbol: string;
        sector: string;
        shares: number;
        price: number | null;
        change: number | null;
        volume: number | null;
        currency: string;
        asOf: string | null;
    }[];
    sectors: {
        sector: string;
        value: number;
        weight: number;
    }[];
    totalValue: number;
    coverage: string;
}>;
export declare function getPortfolioResearch(userId: string, exchange: ExchangeCode): Promise<{
 riskIntelligence: unknown;
    currency: string | null;
    correlations: {
        dates: string[];
        pairs: {
            a: string;
            b: string;
            correlation: number | null;
        }[];
        methodology: string;
    };
    risk: {
        available: false;
        reason: string;
        symbols: string[];
        observations: number;
        excludedIntervals: number;
        coveredWeight: number;
        metrics: null;
    } | {
        available: true;
        reason: string;
        symbols: string[];
        observations: number;
        excludedIntervals: number;
        coveredWeight: number;
        metrics: {
            attribution: {
                coveredWeight: number;
                observations: number;
                contributions: {
                    symbol: string;
                    weight: number;
                    varianceContribution: number;
                    riskShare: number;
                }[];
                historicalVaR95: number | null;
                expectedShortfall95: number | null;
                tailObservations: number;
                methodology: string;
            } | null;
            portfolioVolatility: number;
            marketVolatility: number;
            portfolioMaxDrawdown: number;
            portfolioBeta: number | null;
            sharpe: null;
            sortino: null;
            volatilityByHolding: {
                symbol: string;
                volatility: number;
            }[];
            drawdownByHolding: {
                symbol: string;
                drawdown: number;
            }[];
        };
    };
    researchBriefing: {
        covered: number;
        requested: number;
        limit: number;
        companies: {
            symbol: string;
            weight: number;
            period: number | null;
            metrics: {};
            findings: string[];
            sectorNote: string | null;
            facts: string[];
            risks: string[];
            qualityWarnings: string[];
            unavailable: string[];
            changes: {
                topic: string;
                text: string;
                material: boolean;
            }[];
        }[];
        news: {
            symbol: string;
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
        methodology: string;
    };
    dividends: {
        symbol: string;
        trailingIncome: number | null;
        upcoming: {
            date: string;
            amount: number;
        }[];
    }[];
    performance: {
        twr: null;
        moneyWeighted: null;
        reason: string;
    } | {
        twr: number;
        moneyWeighted: number | null;
        reason: string;
    };
    snapshots: {
        date: string;
        value: number;
        flow: number;
    }[];
    flows: any[];
    methodology: string;
    historyWarnings: string[];
    available: boolean;
    reason: string;
    positions: never[];
    sectors: never[];
    totalValue: number;
    sessionPnl: null;
    coverage: string;
    warnings: string[];
} | {
    currency: string | null;
    correlations: {
        dates: string[];
        pairs: {
            a: string;
            b: string;
            correlation: number | null;
        }[];
        methodology: string;
    };
    risk: {
        available: false;
        reason: string;
        symbols: string[];
        observations: number;
        excludedIntervals: number;
        coveredWeight: number;
        metrics: null;
    } | {
        available: true;
        reason: string;
        symbols: string[];
        observations: number;
        excludedIntervals: number;
        coveredWeight: number;
        metrics: {
            attribution: {
                coveredWeight: number;
                observations: number;
                contributions: {
                    symbol: string;
                    weight: number;
                    varianceContribution: number;
                    riskShare: number;
                }[];
                historicalVaR95: number | null;
                expectedShortfall95: number | null;
                tailObservations: number;
                methodology: string;
            } | null;
            portfolioVolatility: number;
            marketVolatility: number;
            portfolioMaxDrawdown: number;
            portfolioBeta: number | null;
            sharpe: null;
            sortino: null;
            volatilityByHolding: {
                symbol: string;
                volatility: number;
            }[];
            drawdownByHolding: {
                symbol: string;
                drawdown: number;
            }[];
        };
    };
    researchBriefing: {
        covered: number;
        requested: number;
        limit: number;
        companies: {
            symbol: string;
            weight: number;
            period: number | null;
            metrics: {};
            findings: string[];
            sectorNote: string | null;
            facts: string[];
            risks: string[];
            qualityWarnings: string[];
            unavailable: string[];
            changes: {
                topic: string;
                text: string;
                material: boolean;
            }[];
        }[];
        news: {
            symbol: string;
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
        methodology: string;
    };
    dividends: {
        symbol: string;
        trailingIncome: number | null;
        upcoming: {
            date: string;
            amount: number;
        }[];
    }[];
    performance: {
        twr: null;
        moneyWeighted: null;
        reason: string;
    } | {
        twr: number;
        moneyWeighted: number | null;
        reason: string;
    };
    snapshots: {
        date: string;
        value: number;
        flow: number;
    }[];
    flows: any[];
    methodology: string;
    historyWarnings: string[];
    available: boolean;
    reason: null;
    positions: {
        value: number;
        weight: number;
        sessionContribution: number | null;
        participation: number | null;
        symbol: string;
        sector: string;
        shares: number;
        price: number | null;
        change: number | null;
        volume: number | null;
        currency: string;
        asOf: string | null;
    }[];
    sectors: {
        sector: string;
        value: number;
        weight: number;
    }[];
    totalValue: number;
    sessionPnl: number | null;
    coverage: string;
    warnings: string[];
}>;
export declare function getPeers(symbol: string, exchange: ExchangeCode): Promise<{
    symbol: string;
    name: string;
    sector: string | null;
    currency: string;
    period: number | null;
    ratios: import("../../types/market.js").ComputedRatios | null;
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
}[]>;
