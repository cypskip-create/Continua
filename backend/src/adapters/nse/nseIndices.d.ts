import type { MarketIndex } from '../../types/market.js';
export declare function normalizeNseIndices(rows: unknown, now?: number): MarketIndex[];
/** Scraper owns external fetching/robots/provenance; backend validates and
 * publishes only observations from the configured official NSE source. */
export declare function readPublishedNseIndices(): Promise<MarketIndex[]>;
