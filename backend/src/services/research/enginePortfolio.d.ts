export interface PricedPosition {
    symbol: string;
    sector: string;
    shares: number;
    price: number | null;
    change: number | null;
    volume: number | null;
    currency: string;
    asOf: string | null;
}
export declare function portfolioAnalysis(positions: PricedPosition[]): {
    available: boolean;
    reason: string;
    positions: never[];
    sectors: never[];
    totalValue: number;
    sessionPnl: null;
    coverage: string;
    warnings: string[];
} | {
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
};
export interface PerformancePoint {
    date: string;
    value: number;
    flow: number;
}
export declare function performance(points: PerformancePoint[], datedFlows?: {
    date: string;
    amount: number;
}[]): {
    twr: null;
    moneyWeighted: null;
    reason: string;
} | {
    twr: number;
    moneyWeighted: number | null;
    reason: string;
};
export declare function dailyCloseMap(bars: {
    timestamp: string;
    close: number;
}[]): Map<string, number>;
export declare function alignedReturns(series: Record<string, {
    timestamp: string;
    close: number;
}[]>): {
    dates: string[];
    pairs: {
        a: string;
        b: string;
        correlation: number | null;
    }[];
    methodology: string;
};
