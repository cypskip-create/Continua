/**
 * The contract every exchange adapter must satisfy. The ingestion layer only
 * ever talks to this interface — it has no idea whether it's NSE, NGX, or
 * JSE underneath. Add a new exchange by implementing this interface once,
 * then registering it in adapters/registry.ts. Nothing else changes.
 */
import type {
  Quote, Candle, Company, Security, Sector, FinancialPeriod,
  IncomeStatement, BalanceSheet, CashFlowStatement, MarketIndex,
  CorporateAction, EarningsEvent, OwnershipRecord,
} from "../types/market.js";
import type { ExchangeCode } from "../config/index.js";

export interface FundamentalsBundle {
  security: Security;
  company: Company;
  sector: Sector;
  period: FinancialPeriod;
  income: IncomeStatement;
  balance: BalanceSheet;
  cashFlow: CashFlowStatement;
}

export interface IExchangeAdapter {
  readonly exchange: ExchangeCode;

  /** Full list of currently listed securities on this exchange. */
  listSecurities(): Promise<Security[]>;

  /** Security + company + sector for every symbol this adapter knows
   *  about, WITHOUT requiring financials to exist yet. Optional — only
   *  adapters that can enumerate a listing independent of fundamentals
   *  (e.g. a source with no financials feed at all, like MyStocksClient)
   *  implement this. Used solely to seed a bare-bones market.securities
   *  row (symbol + placeholder name + sector) so a security can start
   *  getting real prices immediately, rather than waiting on the slower,
   *  separate fundamentals pipeline to ever successfully collect a full
   *  bundle for it — which, for a source with no financials data, would
   *  never happen. NEVER used to overwrite an existing security's real
   *  company name/sector once the fundamentals pipeline has populated
   *  one — callers must check for an existing row first. */
  listSecuritiesWithCompanies?(): Promise<{ security: Security; company: Company; sector: Sector }[]>;

  /** Latest quote for one or more symbols. */
  getQuotes(symbols: string[]): Promise<Quote[]>;

  /** Benchmark/market indices for this exchange (e.g. NASI, NGX30). One
   *  exchange can have several; return all of them — the caller filters. */
  getIndices(): Promise<MarketIndex[]>;

  /** Historical OHLCV candles for a symbol/interval/date range. */
  getCandles(symbol: string, interval: Candle["interval"], from: string, to: string): Promise<Candle[]>;

  /** Company + latest fundamentals bundle for a symbol. */
  getFundamentals(symbol: string): Promise<FundamentalsBundle | null>;

  /** Corporate actions for a symbol (or all, if symbol omitted) since a given date. */
  getCorporateActions(symbol: string | null, since: string): Promise<CorporateAction[]>;

  /** Upcoming/recent earnings events. */
  getEarningsEvents(symbol: string | null, since: string): Promise<EarningsEvent[]>;

  /** Ownership breakdown for a symbol, where available. */
  getOwnership(symbol: string): Promise<OwnershipRecord[]>;

  /** Subscribe to a continuous live tick stream. Returns an unsubscribe fn.
   *  Mock mode simulates ticks on an interval; a real feed would open a
   *  WebSocket/FIX session to the licensed provider here instead. */
  subscribeQuotes(symbols: string[], onQuote: (quote: Quote) => void): () => void;
}