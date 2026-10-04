/**
 * The NSE adapter — implements IExchangeAdapter by composing the NSE client
 * (transport) with the NSE mapper (translation). This is the ONLY file the
 * ingestion layer imports from this folder; nseClient.ts and nseMapper.ts
 * are implementation details of the NSE adapter.
 */
import type { IExchangeAdapter, FundamentalsBundle } from "../types.js";
import type { Quote, Candle, Security, Company, Sector, CorporateAction, EarningsEvent, OwnershipRecord, MarketIndex } from "../../types/market.js";
import { createNseClient, type INseClient } from "./nseClient.js";
import {
  mapSecurity, mapQuote, mapCandle, mapFundamentalsBundle,
  mapCorporateAction, mapEarningsEvent, mapOwnership, mapCompany, mapSector,
} from "./nseMapper.js";
import type { NseRawCandle } from "./nseRawTypes.js";
import { readPublishedNseIndices } from "./nseIndices.js";

const INTERVAL_TO_RAW: Record<Candle["interval"], NseRawCandle["Interval"]> = {
  "1m": "1MIN", "5m": "5MIN", "15m": "15MIN", "1h": "1HR",
  "1d": "1D", "1w": "1W", "1M": "1MO", "1y": "1Y",
};

export class NseAdapter implements IExchangeAdapter {
  readonly exchange = "NSE" as const;
  private client: INseClient;

  constructor(client: INseClient = createNseClient()) {
    this.client = client;
  }

  async listSecurities(): Promise<Security[]> {
    const raw = await this.client.fetchSecurities();
    return raw.map(mapSecurity);
  }

  /** See IExchangeAdapter.listSecuritiesWithCompanies — pairs each raw
   *  listing with a company/sector derived WITHOUT a profile or
   *  financials, since callers of this only need enough to create a
   *  bare-bones row, and sources like MyStocksClient never have a real
   *  profile to offer anyway (mapCompany(raw, null) already handles a
   *  null profile gracefully — see nseMapper.ts). */
  async listSecuritiesWithCompanies(): Promise<{ security: Security; company: Company; sector: Sector }[]> {
    const raw = await this.client.fetchSecurities();
    return raw.map((r) => ({
      security: mapSecurity(r),
      company: mapCompany(r, null),
      sector: mapSector(r),
    }));
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const raw = await this.client.fetchQuotes(symbols);
    return raw.map(mapQuote);
  }

  /** Only publisher observations; individual stock moves cannot recreate
   * the exchange's official index without its divisor and constituents. */
  async getIndices(): Promise<MarketIndex[]> {
    return readPublishedNseIndices();
  }

  async getCandles(symbol: string, interval: Candle["interval"], from: string, to: string): Promise<Candle[]> {
    const raw = await this.client.fetchCandles(symbol, INTERVAL_TO_RAW[interval], from, to);
    return raw.map(mapCandle);
  }

  async getFundamentals(symbol: string): Promise<FundamentalsBundle | null> {
    const history = await this.getFundamentalsHistory(symbol);
    return history.at(-1) ?? null;
  }

  async getFundamentalsHistory(symbol: string): Promise<FundamentalsBundle[]> {
    const [securities, profile, periods] = await Promise.all([
      this.client.fetchSecurities(),
      this.client.fetchCompanyProfile(symbol),
      this.client.fetchFinancials(symbol),
    ]);
    const security = securities.find((s) => s.Symbol === symbol);
    if (!security) return [];
    return periods.map(period => mapFundamentalsBundle(security, profile, period))
      .sort((a, b) => a.period.periodEnd.localeCompare(b.period.periodEnd));
  }

  async getCorporateActions(symbol: string | null, since: string): Promise<CorporateAction[]> {
    const raw = await this.client.fetchCorporateActions(symbol, since);
    return raw.map((r, i) => mapCorporateAction(r, `NSE:ca:${r.Symbol}:${r.ActionType}:${r.AnnouncedDate}:${i}`));
  }

  async getEarningsEvents(symbol: string | null, since: string): Promise<EarningsEvent[]> {
    const raw = await this.client.fetchEarningsEvents(symbol, since);
    return raw.map((r, i) => mapEarningsEvent(r, `NSE:earn:${r.Symbol}:${r.FiscalYear}:${r.FiscalQuarter ?? 0}:${i}`));
  }

  async getOwnership(symbol: string): Promise<OwnershipRecord[]> {
    const raw = await this.client.fetchOwnership(symbol);
    return raw.map(mapOwnership);
  }

  subscribeQuotes(symbols: string[], onQuote: (quote: Quote) => void): () => void {
    return this.client.streamQuotes(symbols, (raw) => onQuote(mapQuote(raw)));
  }
}
