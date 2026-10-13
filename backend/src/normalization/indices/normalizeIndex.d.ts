/**
 * Exchange-agnostic cleanup for MarketIndex, same rationale as
 * normalizePrice.ts: change/changePercent are recomputed from
 * value/previousClose rather than trusted from the feed, since a feed can
 * send a stale delta alongside a fresh value.
 */
import type { MarketIndex } from "../../types/market.js";
export declare function normalizeIndex(index: MarketIndex): MarketIndex;
