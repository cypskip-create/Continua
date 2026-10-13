import type { Candle, CandleInterval } from "../../types/market.js";
export declare const candlesRepository: {
    /** Bulk upsert via a single multi-row statement — candle backfills can be
     *  thousands of rows and we don't want thousands of round-trips. */
    upsertCandlesBatch(candles: Candle[]): Promise<void>;
    getCandles(securityId: string, interval: CandleInterval, from: string, to: string): Promise<Candle[]>;
    /** price-at-date / range helpers used by the research engine for returns
     *  and momentum calculations. */
    getPriceAt(securityId: string, atOrBefore: string): Promise<number | null>;
    getHighLow(securityId: string, from: string, to: string): Promise<{
        high: number;
        low: number;
    } | null>;
    /** Last `limit` daily closes for each of several securities in one
     *  query — the batch equivalent of getCandles(), built specifically for
     *  list-view sparklines (Watchlist, Markets, Screener, etc.) so those
     *  views don't fire one request per row. Returns real closes only; a
     *  securityId with no candle history is simply absent from the map —
     *  callers must render an honest empty state for it, never fabricate
     *  a line. Chronological order (oldest first) per security. */
    getRecentClosesBatch(securityIds: string[], limit?: number): Promise<Map<string, {
        timestamp: string;
        close: number;
    }[]>>;
    getAverageVolume(securityId: string, from: string, to: string): Promise<number | null>;
};
