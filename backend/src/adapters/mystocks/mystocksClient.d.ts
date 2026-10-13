import type { INseClient } from "../nse/nseClient.js";
import type { NseRawSecurity, NseRawQuote, NseRawCandle, NseRawCompanyProfile, NseRawFinancialPeriod, NseRawCorporateAction, NseRawEarningsEvent, NseRawOwnership } from "../nse/nseRawTypes.js";
export declare class MyStocksClient implements INseClient {
    fetchSecurities(): Promise<NseRawSecurity[]>;
    fetchQuotes(symbols: string[]): Promise<NseRawQuote[]>;
    fetchCandles(symbol: string, interval: NseRawCandle["Interval"], from: string, to: string): Promise<NseRawCandle[]>;
    fetchCompanyProfile(_symbol: string): Promise<NseRawCompanyProfile | null>;
    fetchFinancials(_symbol: string): Promise<NseRawFinancialPeriod[]>;
    fetchCorporateActions(_symbol: string | null, _since: string): Promise<NseRawCorporateAction[]>;
    fetchEarningsEvents(_symbol: string | null, _since: string): Promise<NseRawEarningsEvent[]>;
    fetchOwnership(_symbol: string): Promise<NseRawOwnership[]>;
    streamQuotes(symbols: string[], onTick: (q: NseRawQuote) => void): () => void;
}
