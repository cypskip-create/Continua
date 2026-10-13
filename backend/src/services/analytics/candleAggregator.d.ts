/**
 * Rolls lower-timeframe candles up into higher timeframes (e.g. 1m → 1h,
 * 1d → 1w/1M/1y). Used by the historical pipeline so we don't have to fetch
 * every timeframe independently from the adapter — one fine-grained pull,
 * many derived resolutions.
 */
import type { Candle, CandleInterval } from "../../types/market.js";
export declare function aggregateCandles(source: Candle[], targetInterval: CandleInterval): Candle[];
