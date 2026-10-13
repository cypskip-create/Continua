import type { Candle } from "../../types/market.js";
export interface ExecutionOptions {
    feeBps: number;
    slippageBps: number;
    initialCapital: number;
    maxVolumeParticipation: number;
}
export declare function simulateExecution(bars: Candle[], signals: ("buy" | "sell" | "hold")[], options: ExecutionOptions): {
    trades: {
        entryDate: string;
        entryPrice: number;
        exitDate: string;
        exitPrice: number;
        returnPercent: number;
        holdingDays: number;
    }[];
    equity: {
        date: string;
        value: number;
    }[];
    skipped: number;
    openPosition: boolean;
    totalReturnPercent: number;
    maxDrawdownPercent: number;
};
