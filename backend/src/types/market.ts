/**
 * ─────────────────────────────────────────────────────────────────────────
 * Continua Standard Schema
 * ─────────────────────────────────────────────────────────────────────────
 * This is the ONE shape every exchange in the system must normalize into.
 * NSE speaks NSE. NGX will speak NGX. JSE will speak JSE. None of that
 * leaves the adapter layer — everything above (ingestion, storage,
 * calculation, API, the app) only ever sees these types. That's what makes
 * adding a new exchange later a matter of writing one adapter, not touching
 * the rest of the system.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ExchangeCode } from "../config/index.js";

export type Currency = "KES" | "NGN" | "ZAR" | "EGP" | "GHS" | "XOF" | "USD" | "TZS" | "ZMW";

export type SecurityStatus = "active" | "suspended" | "halted" | "delisted";

/** ── Reference data ──────────────────────────────────────────────────── */

export interface Exchange {
  code: ExchangeCode;
  name: string;
  country: string;
  currency: Currency;
  timezone: string;          // IANA tz, e.g. "Africa/Nairobi"
  mic: string;               // ISO 10383 Market Identifier Code, e.g. "XNAI"
}

export interface Sector {
  id: string;
  name: string;
}

export interface Industry {
  id: string;
  sectorId: string;
  name: string;
}

export interface Company {
  id: string;                // Continua-internal UUID
  name: string;
  description?: string;
  sectorId?: string;
  industryId?: string;
  headquarters?: string;
  ceo?: string;
  employees?: string;
  founded?: string;
  website?: string;
}

export interface Security {
  id: string;                // Continua-internal UUID, stable across renames
  symbol: string;             // exchange ticker, e.g. "SCOM"
  exchange: ExchangeCode;
  companyId: string;
  currency: Currency;
  status: SecurityStatus;
  isin?: string;
  listedAt?: string;          // ISO date
}

/** ── Live / quote data ───────────────────────────────────────────────── */

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
  timestamp: string;          // ISO 8601, exchange-local event time normalized to UTC
  source: "live" | "delayed" | "eod";
}

/** A market/benchmark index — NASI, NGX30, JSE All Share, etc. Deliberately
 *  NOT a Security: an index isn't tradable, has no company/sector, and its
 *  "id" namespace is separate (`${exchange}:index:${code}`) so it can never
 *  collide with a real ticker. */
export interface MarketIndex {
  id: string;
  code: string;             // 'NASI', 'NGX30', 'ALSI', ...
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

/** ── Historical / candle data ────────────────────────────────────────── */

export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "1d" | "1w" | "1M" | "1y";

export interface Candle {
  securityId: string;
  interval: CandleInterval;
  timestamp: string;          // candle open time, ISO 8601 UTC
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** ── Fundamentals ────────────────────────────────────────────────────── */

export type FiscalPeriodType = "annual" | "quarterly";

export interface FinancialPeriod {
  id: string;
  securityId: string;
  periodType: FiscalPeriodType;
  fiscalYear: number;
  fiscalQuarter?: number;     // 1-4, only for quarterly
  periodEnd: string;          // ISO date
  reportedAt: string;         // ISO date the filing was published
  currency: Currency;
}

export interface IncomeStatement {
  periodId: string;
  revenue: number;
  costOfRevenue?: number;
  grossProfit?: number;
  operatingExpenses?: number;
  operatingIncome?: number;
  netIncome: number;
  eps: number;
  dilutedEps?: number;
  ebitda?: number;
}

export interface BalanceSheet {
  periodId: string;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  cash?: number;
  totalDebt?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  sharesOutstanding?: number;
}

export interface CashFlowStatement {
  periodId: string;
  /** Optional because not every exchange adapter's data source provides a
   *  cash flow statement (e.g. Mansa's fundamentals endpoint doesn't) —
   *  undefined means "unavailable from this provider", not "zero". Any
   *  ratio/screener calculation using this must skip rather than treat
   *  missing as 0. */
  operatingCashFlow?: number;
  investingCashFlow?: number;
  financingCashFlow?: number;
  freeCashFlow?: number;
  capex?: number;
}

export interface EarningsEvent {
  id: string;
  securityId: string;
  periodId?: string;
  fiscalYear: number;
  fiscalQuarter?: number;
  expectedDate?: string;
  reportedDate?: string;
  epsEstimate?: number;
  epsActual?: number;
  revenueEstimate?: number;
  revenueActual?: number;
}

export interface OwnershipRecord {
  securityId: string;
  holderName: string;
  holderType: "insider" | "institution" | "government" | "public" | "other";
  sharesHeld: number;
  percentHeld: number;
  asOf: string;
}

/** ── Corporate actions ───────────────────────────────────────────────── */

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
  details: CorporateActionDetails;
  status: "announced" | "confirmed" | "completed" | "cancelled";
}

export type CorporateActionDetails =
  | { type: "dividend"; amountPerShare: number; currency: Currency; dividendType: "interim" | "final" | "special" }
  | { type: "split"; ratioFrom: number; ratioTo: number }
  | { type: "bonus_issue"; ratioFrom: number; ratioTo: number }
  | { type: "rights_issue"; ratio: string; priceKes: number }
  | { type: "buyback"; sharesTargeted?: number; amount?: number }
  | { type: "merger" | "acquisition"; counterparty: string; notes?: string }
  | { type: "suspension" | "trading_halt"; reason?: string };

/** ── Derived / computed metrics ──────────────────────────────────────── */

export interface ComputedRatios {
  securityId: string;
  asOf: string;
  pe?: number;
  pb?: number;
  evEbitda?: number;
  roe?: number;
  roa?: number;
  roic?: number;
  grossMargin?: number;
  operatingMargin?: number;
  netMargin?: number;
  dividendYield?: number;
  payoutRatio?: number;
  currentRatio?: number;
  debtToEquity?: number;
  interestCoverage?: number;
  priceMomentum3m?: number;
  volatility90d?: number;
}

export interface AfriScoreResult {
  securityId: string;
  asOf: string;
  afriScore: number;          // 0-100 composite
  afriValue: number;
  afriGrowth: number;
  afriHealth: number;
  afriIncome: number;
  afriRisk: number;
  afriQuality: number;
  afriMomentum: number;
  inputs: Record<string, number | null>;
}

/** ── Company announcements (scraper bridge) ──────────────────────────── */

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

/** ── Financial statement candidates (scraper bridge, review queue) ──────
 *  A raw table detected by continua-scraper's tableExtract.ts, staged here
 *  for human confirmation before it ever becomes a real FinancialPeriod /
 *  IncomeStatement / BalanceSheet / CashFlowStatement — see the migration's
 *  header comment for why this can't be safely automated end-to-end. */

export interface DetectedTableRow {
  label: string;
  values: string[];
}

export interface DetectedFinancialTable {
  title: string | null;
  headerLine: string | null;
  rows: DetectedTableRow[];
  method: string;
  confidence: number;
}

export interface FinancialStatementCandidate {
  id: string;
  companyId: string | null;
  securityId: string | null;
  rawCompanyName: string | null;
  source: string;
  exchange: ExchangeCode;
  documentUrl: string;
  documentTitle: string | null;
  tableIndex: number;
  detectedTable: DetectedFinancialTable;
  detectionConfidence: number | null;
  scrapedArtifactId: number | null;
  scrapedExtractionId: number | null;
  status: "pending" | "confirmed" | "rejected";
  reviewedAt: string | null;
  reviewedNote: string | null;
  resultingPeriodId: string | null;
  createdAt: string;
}

/** ── News (scraper bridge, general market/business news via RSS) ───────
 *  See "news bridge.sql" for why this is a separate table from
 *  company_announcements rather than a shared shape. */

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

/** ── Ingestion metadata (audit trail) ────────────────────────────────── */

export interface IngestionRecord {
  id: string;
  exchange: ExchangeCode;
  dataset: "price" | "candle" | "company" | "financials" | "corporate_action" | "earnings" | "ownership" | "index" | "announcement" | "financial_statement_candidate" | "news";
  status: "success" | "partial" | "failed";
  recordCount: number;
  errorCount: number;
  startedAt: string;
  finishedAt: string;
  errors?: string[];
}