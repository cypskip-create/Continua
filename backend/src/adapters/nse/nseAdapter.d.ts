/**
 * The NSE adapter — implements IExchangeAdapter by composing the NSE client
 * (transport) with the NSE mapper (translation). This is the ONLY file the
 * ingestion layer imports from this folder; nseClient.ts and nseMapper.ts
 * are implementation details of the NSE adapter.
 */
import type { IExchangeAdapter, FundamentalsBundle } from "../types.js";
import type { Quote, Candle, Security, Company, Sector, CorporateAction, EarningsEvent, OwnershipRecord, MarketIndex } from "../../types/market.js";
import { type INseClient } from "./nseClient.js";
export declare class NseAdapter implements IExchangeAdapter {
    readonly exchange: "NSE";
    private client;
    constructor(client?: INseClient);
    listSecurities(): Promise<Security[]>;
    /** See IExchangeAdapter.listSecuritiesWithCompanies — pairs each raw
     *  listing with a company/sector derived WITHOUT a profile or
     *  financials, since callers of this only need enough to create a
     *  bare-bones row, and sources like MyStocksClient never have a real
     *  profile to offer anyway (mapCompany(raw, null) already handles a
     *  null profile gracefully — see nseMapper.ts). */
    listSecuritiesWithCompanies(): Promise<{
        security: Security;
        company: Company;
        sector: Sector;
    }[]>;
    getQuotes(symbols: string[]): Promise<Quote[]>;
    /** Only publisher observations; individual stock moves cannot recreate
     * the exchange's official index without its divisor and constituents. */
    getIndices(): Promise<MarketIndex[]>;
    getCandles(symbol: string, interval: Candle["interval"], from: string, to: string): Promise<Candle[]>;
    getFundamentals(symbol: string): Promise<FundamentalsBundle | null>;
    getFundamentalsHistory(symbol: string): Promise<FundamentalsBundle[]>;
    getCorporateActions(symbol: string | null, since: string): Promise<CorporateAction[]>;
    getEarningsEvents(symbol: string | null, since: string): Promise<EarningsEvent[]>;
    getOwnership(symbol: string): Promise<OwnershipRecord[]>;
    subscribeQuotes(symbols: string[], onQuote: (quote: Quote) => void): () => void;
}
