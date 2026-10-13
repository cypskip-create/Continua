import type { Quote } from "../../types/market.js";
export declare const pricesRepository: {
    /** Live quotes are upserted in place, keyed by security — we only ever
     *  need the latest tick in the relational store; intraday history lives
     *  in candles, not here. This keeps the hot table tiny and fast. */
    upsertQuote(q: Quote): Promise<void>;
    upsertQuotesBatch(quotes: Quote[]): Promise<void>;
    getQuote(securityId: string): Promise<Quote | null>;
    getQuotesBatch(securityIds: string[]): Promise<Quote[]>;
    getTopMovers(exchange: string, limit?: number): Promise<{
        gainers: Quote[];
        losers: Quote[];
    }>;
};
