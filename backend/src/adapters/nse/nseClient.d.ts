import type { NseRawSecurity, NseRawQuote, NseRawCandle, NseRawCompanyProfile, NseRawFinancialPeriod, NseRawCorporateAction, NseRawEarningsEvent, NseRawOwnership } from "./nseRawTypes.js";
export interface INseClient {
    fetchSecurities(): Promise<NseRawSecurity[]>;
    fetchQuotes(symbols: string[]): Promise<NseRawQuote[]>;
    fetchCandles(symbol: string, interval: NseRawCandle["Interval"], from: string, to: string): Promise<NseRawCandle[]>;
    fetchCompanyProfile(symbol: string): Promise<NseRawCompanyProfile | null>;
    fetchFinancials(symbol: string): Promise<NseRawFinancialPeriod[]>;
    fetchCorporateActions(symbol: string | null, since: string): Promise<NseRawCorporateAction[]>;
    fetchEarningsEvents(symbol: string | null, since: string): Promise<NseRawEarningsEvent[]>;
    fetchOwnership(symbol: string): Promise<NseRawOwnership[]>;
    /** Long-lived tick subscription. Returns an unsubscribe function. */
    streamQuotes(symbols: string[], onTick: (q: NseRawQuote) => void): () => void;
}
export declare class MockNseClient implements INseClient {
    fetchSecurities(): Promise<NseRawSecurity[]>;
    fetchQuotes(symbols: string[]): Promise<NseRawQuote[]>;
    fetchCandles(symbol: string, interval: NseRawCandle["Interval"], from: string, to: string): Promise<NseRawCandle[]>;
    fetchCompanyProfile(symbol: string): Promise<NseRawCompanyProfile | null>;
    fetchFinancials(symbol: string): Promise<NseRawFinancialPeriod[]>;
    fetchCorporateActions(symbol: string | null, _since: string): Promise<NseRawCorporateAction[]>;
    fetchEarningsEvents(symbol: string | null, _since: string): Promise<NseRawEarningsEvent[]>;
    fetchOwnership(symbol: string): Promise<NseRawOwnership[]>;
    streamQuotes(symbols: string[], onTick: (q: NseRawQuote) => void): () => void;
}
export declare function createNseClient(): INseClient;
