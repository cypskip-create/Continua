import type { ExchangeCode } from "../../config/index.js";
export type StrategyType = "sma_cross" | "ema_cross" | "rsi_reversion";
export interface BacktestRequest {
    exchange: ExchangeCode;
    symbol: string;
    strategy: StrategyType;
    from: string;
    to: string;
    feeBps?: number;
    slippageBps?: number;
    initialCapital?: number;
    maxVolumeParticipation?: number;
    fastPeriod?: number;
    slowPeriod?: number;
    rsiPeriod?: number;
    oversold?: number;
    overbought?: number;
}
export interface Trade {
    entryDate: string;
    entryPrice: number;
    exitDate: string;
    exitPrice: number;
    returnPercent: number;
    holdingDays: number;
}
export interface BacktestResult {
    symbol: string;
    exchange: ExchangeCode;
    strategy: StrategyType;
    params: Record<string, number>;
    from: string;
    to: string;
    trades: Trade[];
    metrics: {
        totalTrades: number;
        winRate: number | null;
        totalReturnPercent: number;
        buyHoldReturnPercent: number;
        maxDrawdownPercent: number;
        averageHoldingDays: number | null;
    };
    /** Load-bearing disclaimer, not boilerplate — see file header. Always
     *  present in the response so no UI can accidentally drop it. */
    caveat: string;
    execution: {
        feeBps: number;
        slippageBps: number;
        initialCapital: number;
        maxVolumeParticipation: number;
        skipped: number;
        openPosition: boolean;
    };
    evaluation: {
        inSampleReturn: number;
        outOfSampleReturn: number | null;
        splitDate: string | null;
    };
}
export declare const backtestService: {
    run(req: BacktestRequest): Promise<BacktestResult | null>;
};
