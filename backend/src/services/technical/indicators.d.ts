/** NSE research data. Coverage depends on the available sources; missing values remain unavailable. */
import type { Candle } from "../../types/market.js";
export type IndicatorSeries = (number | null)[];
export declare function sma(candles: Candle[], period: number): IndicatorSeries;
export declare function ema(candles: Candle[], period: number): IndicatorSeries;
/** Wilder's RSI (the standard formulation — same one virtually every
 *  charting platform uses, including Moomoo's). 0-100, null until `period`
 *  candles of history exist. */
export declare function rsi(candles: Candle[], period?: number): IndicatorSeries;
export interface MacdResult {
    macd: IndicatorSeries;
    signal: IndicatorSeries;
    histogram: IndicatorSeries;
}
export declare function macd(candles: Candle[], fast?: number, slow?: number, signalPeriod?: number): MacdResult;
/** Detects the most recent crossover in a fast/slow series pair (used by
 *  both indicator-alert evaluation and the backtester's sma_cross /
 *  ema_cross strategies). Returns null if the two most recent points don't
 *  form a fresh cross (i.e. the ordering didn't just flip). */
export declare function latestCrossover(fast: IndicatorSeries, slow: IndicatorSeries): "bullish" | "bearish" | null;
