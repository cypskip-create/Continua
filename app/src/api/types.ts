// Types mirroring the Continua Data Layer's standard schema
// (backend/src/types/market.ts) and its documented API response shapes
// (docs/api/API.md). Kept as plain interfaces — no class instances, no
// coupling to how the backend stores anything — so the frontend only ever
// depends on the wire contract, not the backend's internals.

export type Currency = "KES" | "NGN" | "ZAR" | "EGP" | "GHS" | "XOF" | "USD" | "TZS" | "ZMW";
export type SecurityStatus = "active" | "suspended" | "halted" | "delisted";
export type ExchangeCode = "NSE" | "NGX" | "JSE" | "EGX" | "GSE" | "BRVM" | "LuSE" | "DSE";

export interface Quote {
  securityId: string;
  symbol: string;
  exchange: ExchangeCode;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  bid?: number;
  ask?: number;
  marketCap?: number;
  currency: Currency;
  status: SecurityStatus;
  timestamp: string;
  source: "live" | "delayed" | "eod";
}

export interface MarketIndex {
  id: string;
  code: string;
  name: string;
  exchange: ExchangeCode;
  value: number;
  previousClose: number;
  change: number;
  changePercent: number;
  currency: Currency;
  timestamp: string;
  source: "live" | "delayed" | "eod";
}

export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "1d" | "1w" | "1M" | "1y";

export interface Candle {
  securityId: string;
  interval: CandleInterval;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RangePerformance {
  securityId: string;
  from: string;
  to: string;
  startPrice: number;
  endPrice: number;
  changePercent: number;
}

export interface CompanyProfile {
  id: string;
  symbol: string;
  exchange: ExchangeCode;
  companyId: string;
  currency: Currency;
  status: SecurityStatus;
  isin?: string;
  listedAt?: string;
  company: {
    id: string;
    name: string;
    description?: string;
    headquarters?: string;
    ceo?: string;
    employees?: string;
    founded?: string;
    website?: string;
    sectorName?: string;
  };
}

export type FiscalPeriodType = "annual" | "quarterly";

export interface FinancialPeriodBundle {
  periodId: string;
  securityId: string;
  periodType: FiscalPeriodType;
  fiscalYear: number;
  fiscalQuarter?: number | null;
  periodEnd: string;
  reportedAt: string;
  currency: Currency;
  // Income statement
  revenue: number;
  netIncome: number;
  eps: number;
  dilutedEps?: number;
  ebitda?: number;
  grossProfit?: number;
  operatingIncome?: number;
  costOfRevenue?: number;
  operatingExpenses?: number;
  // Balance sheet
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  cash?: number;
  totalDebt?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  sharesOutstanding?: number;
  // Cash flow
  operatingCashFlow: number;
  investingCashFlow?: number;
  financingCashFlow?: number;
  freeCashFlow?: number;
  capex?: number;
}

export interface FinancialHistoryEntry {
  fiscalYear: number;
  fiscalQuarter?: number | null;
  revenue: number;
  netIncome: number;
  eps: number;
}

export type CorporateActionType =
  | "dividend" | "split" | "bonus_issue" | "rights_issue"
  | "buyback" | "merger" | "acquisition" | "suspension" | "trading_halt";

export interface CorporateAction {
  id: string;
  securityId: string;
  type: CorporateActionType;
  announcedAt: string;
  exDate?: string;
  recordDate?: string;
  payDate?: string;
  effectiveDate?: string;
  details: Record<string, unknown>;
  status: "announced" | "confirmed" | "completed" | "cancelled";
}

/** Regulatory/company announcement, sourced by continua-scraper from NSE
 *  filings (PDFs) and other configured feeds — not editorial content.
 *  `publishedAt` is frequently null: the scraper doesn't yet reliably
 *  read a publish date off every source, and the Data Layer leaves it
 *  honest rather than guessing. `needsReview` means entity resolution
 *  matched this to a company with low confidence. */
export interface CompanyAnnouncement {
  id: string;
  companyId: string | null;
  securityId: string | null;
  rawCompanyName: string | null;
  title: string;
  documentUrl: string;
  source: string;
  exchange: ExchangeCode;
  scrapedArtifactId: number | null;
  scrapedExtractionId: number | null;
  extractionConfidence: number | null;
  needsReview: boolean;
  excerpt: string | null;
  publishedAt: string | null;
}

/** General market/business news (not company filings — see
 *  CompanyAnnouncement for those), scraped via continua-scraper's RSS
 *  adapter and bridged into market.news_items. `securityIds` is a
 *  best-effort keyword match against article text and can be empty for
 *  genuine market/economy-wide stories, not just a missed match — see
 *  `needsReview` for whether the bridge itself flagged this one as
 *  uncertain. There is no in-app "full article" body: only an excerpt is
 *  stored, and the full story lives at `articleUrl` on the original
 *  publisher's site (reproducing full articles isn't something Continua
 *  is licensed to do). */
export interface NewsItem {
  id: string;
  headline: string;
  excerpt: string | null;
  articleUrl: string;
  source: string;
  sourceName: string;
  category: "markets" | "earnings" | "companies" | "economy" | "top";
  securityIds: string[];
  scrapedArtifactId: number | null;
  scrapedExtractionId: number | null;
  extractionConfidence: number | null;
  needsReview: boolean;
  publishedAt: string | null;
}

export interface OwnershipRecord {
  securityId: string;
  holderName: string;
  holderType: "insider" | "institution" | "government" | "public" | "other";
  sharesHeld: number;
  percentHeld: number;
  asOf: string;
}

export interface Movers {
  gainers: Quote[];
  losers: Quote[];
}

export interface SectorRef {
  id: string;
  name: string;
}

export interface ComputedRatios {
  securityId: string;
  asOf: string;
  pe?: number | null;
  pb?: number | null;
  evEbitda?: number | null;
  roe?: number | null;
  roa?: number | null;
  roic?: number | null;
  grossMargin?: number | null;
  operatingMargin?: number | null;
  netMargin?: number | null;
  dividendYield?: number | null;
  payoutRatio?: number | null;
  currentRatio?: number | null;
  debtToEquity?: number | null;
  interestCoverage?: number | null;
  priceMomentum3m?: number | null;
  volatility90d?: number | null;
}

export interface AfriScoreResult {
  securityId: string;
  asOf: string;
  afriScore: number;
  afriValue: number;
  afriGrowth: number;
  afriHealth: number;
  afriIncome: number;
  afriRisk: number;
  afriQuality: number;
  afriMomentum: number;
  inputs: Record<string, number | null>;
}

export interface ResearchBundle {
  ratios: ComputedRatios;
  score: AfriScoreResult;
}

export interface ScreenerRow {
  symbol: string;
  securityId: string;
  companyName: string;
  sector: string | null;
  lastPrice: number | null;
  changePercent: number | null;
  marketCap: number | null;
  pe: number | null;
  dividendYield: number | null;
  afriScore: number | null;
}

export interface Instrument {
  symbol: string;
  securityId: string;
  companyName: string;
  sector: string | null;
  currency: Currency;
  status: SecurityStatus;
  isin: string | null;
}

// ── WebSocket event payloads ──────────────────────────────────────────────
export type MarketEvent =
  | { type: "quote"; payload: Quote }
  | { type: "corporate_action"; payload: CorporateAction }
  | { type: "error"; message: string };