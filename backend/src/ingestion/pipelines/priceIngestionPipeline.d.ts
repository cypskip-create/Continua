/**
 * The live price pipeline: collect (with retry) → normalize → validate →
 * cache → store → broadcast → audit-log. Runs once per poll tick (or per
 * streamed message, in live mode) for every active symbol on an exchange.
 * Failures at any stage are dead-lettered, not silently dropped, and the
 * ingestion log always gets a row — even a total collector failure — so
 * the audit trail never has a gap.
 */
import type { IExchangeAdapter } from "../../adapters/types.js";
export declare function runPriceIngestion(adapter: IExchangeAdapter, symbols?: string[]): Promise<void>;
