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

const INTERVAL_TO_RAW: Record<Candle["interval"], NseRawCandle["Interval"]> = {
  "1m": "1MIN", "5m": "5MIN", "15m": "15MIN", "1h": "1HR",
  "1d": "1D", "1w": "1W", "1M": "1MO", "1y": "1Y",
};

// Real NSE base value for NASI (Jan 2008 = 100, rebased) is in the
// low-100s; the current real-world level (~130 as of early 2026) is a
// reasonable anchor so the mock index reads plausibly next to the real
// index name, without claiming to BE the real NASI's actual live value.
const NASI_BASE_VALUE: number = 132.5;

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

  /** No real NASI index feed exists in mock mode — this is a genuine
   *  market-cap-weighted composite computed from the same seeded mock
   *  quotes everything else in this adapter uses, not a hardcoded number.
   *  Moves realistically in step with the mock securities because it's
   *  actually derived from them, tick to tick. */
  async getIndices(): Promise<MarketIndex[]> {
    const quotes = await this.getQuotes([]); // [] = "all mock symbols", per fetchQuotes' own convention
    if (quotes.length === 0) return [];

    const totalCapNow = quotes.reduce((sum, q) => sum + (q.marketCap ?? 0), 0);
    const totalCapPrev = quotes.reduce((sum, q) => sum + (q.marketCap ?? 0) / (1 + q.changePercent / 100), 0);
    const value = NASI_BASE_VALUE * (totalCapPrev > 0 ? totalCapNow / totalCapPrev : 1);
    const previousClose = NASI_BASE_VALUE;
    const change = value - previousClose;
    const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;

    return [{
      id: "NSE:index:NASI",
      code: "NASI",
      name: "NSE All-Share Index",
      exchange: "NSE",
      value: Math.round(value * 100) / 100,
      previousClose,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      currency: "KES",
      timestamp: new Date().toISOString(),
      source: "delayed",
    }];
  }

  async getCandles(symbol: string, interval: Candle["interval"], from: string, to: string): Promise<Candle[]> {
    const raw = await this.client.fetchCandles(symbol, INTERVAL_TO_RAW[interval], from, to);
    return raw.map(mapCandle);
  }

  async getFundamentals(symbol: string): Promise<FundamentalsBundle | null> {
    const [securities, profile, periods] = await Promise.all([
      this.client.fetchSecurities(),
      this.client.fetchCompanyProfile(symbol),
      this.client.fetchFinancials(symbol),
    ]);
    const security = securities.find((s) => s.Symbol === symbol);
    const latestPeriod = periods.sort((a, b) => b.FiscalYear - a.FiscalYear)[0];
    if (!security || !latestPeriod) return null;
    return mapFundamentalsBundle(security, profile, latestPeriod);
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