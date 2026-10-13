type Bar = {
    timestamp: string;
    close: number;
};
/** Current-weight history is an illustrative basket, never actual account return. */
export declare function portfolioRisk(series: Record<string, Bar[]>, weights: Record<string, number>): {
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
export {};
