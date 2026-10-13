/**
 * Fundamentals move slowly (quarterly/annual filings), so this pipeline is
 * driven by a daily cron (financialsWorker.ts), not a poll loop. After
 * storing, it recomputes ratios + AfriScore for each symbol so research
 * pages are never showing stale scores against fresh financials.
 */
import type { IExchangeAdapter } from "../../adapters/types.js";
export declare function runFundamentalsIngestion(adapter: IExchangeAdapter, symbols: string[]): Promise<void>;
