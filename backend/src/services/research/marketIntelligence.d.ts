export interface MarketObservation {
    symbol: string;
    sector: string | null;
    changePercent: number | null;
    volume: number | null;
    timestamp: string;
}
/** Snapshot signals, not trade-tape assertions. Missing/nonfinite observations never count as flat. */
export declare function analyseMarket(rows: MarketObservation[]): {
    coverage: number;
    advancing: number;
    declining: number;
    unchanged: number;
    distribution: {
        label: string;
        count: number | undefined;
    }[];
    sectors: {
        name: string;
        changePercent: number;
        coverage: number;
        symbols: string[];
    }[];
    monitor: {
        signal: string;
        symbol: string;
        sector: string | null;
        changePercent: number | null;
        volume: number | null;
        timestamp: string;
    }[];
    methodology: string;
};
