import type { Candle, CandleInterval } from "../../types/market.js";
import type { ExchangeCode } from "../../config/index.js";
export declare const historicalService: {
    getCandles(exchange: ExchangeCode, symbol: string, interval: CandleInterval, from: string, to: string): Promise<Candle[]>;
    getRangePerformance(exchange: ExchangeCode, symbol: string, from: string, to: string): Promise<{
        startPrice: number;
        endPrice: number;
        changePercent: number;
    } | null>;
    getHighLow(exchange: ExchangeCode, symbol: string, from: string, to: string): Promise<{
        high: number;
        low: number;
    } | null>;
    /** Batch, symbol-keyed recent-closes for list-view sparklines. A symbol
     *  with no candle history yet (not backfilled, or outside the tracked
     *  universe) is simply absent from the result — the frontend must
     *  render that as an honest empty state, not a fabricated line. */
    getSparklines(exchange: ExchangeCode, symbols: string[], points?: number): Promise<Record<string, number[]>>;
};
