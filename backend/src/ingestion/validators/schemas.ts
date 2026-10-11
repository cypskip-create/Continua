/**
 * Zod schemas mirroring types/market.ts. Every record that enters storage
 * passes through here first — malformed records get rejected with a clear
 * reason instead of silently corrupting a chart or a research metric later.
 */
import { z } from "zod";

const isoDate = z.string().min(4);
const finiteNumber = z.number().finite();
const nonNegativeNumber = finiteNumber.nonnegative();

export const SecuritySchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1).max(20),
  exchange: z.string().min(1),
  companyId: z.string().min(1),
  currency: z.string().length(3),
  status: z.enum(["active", "suspended", "halted", "delisted"]),
  isin: z.string().optional(),
  listedAt: isoDate.optional(),
});

export const QuoteSchema = z.object({
  securityId: z.string().min(1),
  symbol: z.string().min(1),
  exchange: z.string().min(1),
  lastPrice: nonNegativeNumber,
  open: nonNegativeNumber,
  high: nonNegativeNumber,
  low: nonNegativeNumber,
  previousClose: nonNegativeNumber,
  change: finiteNumber,
  changePercent: finiteNumber,
  volume: nonNegativeNumber,
  bid: nonNegativeNumber.optional(),
  ask: nonNegativeNumber.optional(),
  marketCap: nonNegativeNumber.optional(),
  currency: z.string().length(3),
  status: z.enum(["active", "suspended", "halted", "delisted"]),
  timestamp: isoDate,
  source: z.enum(["live", "delayed", "eod"]),
}).refine((q) => q.high >= q.low, { message: "high must be >= low" })
  .refine((q) => q.high >= q.lastPrice * 0.5 && q.lastPrice <= q.high * 1.5 || q.high === 0, {
    message: "lastPrice implausibly far outside high/low range",
  });

export const IndexSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  exchange: z.string().min(1),
  value: nonNegativeNumber,
  previousClose: nonNegativeNumber,
  change: finiteNumber,
  changePercent: finiteNumber,
  currency: z.string().length(3),
  timestamp: isoDate,
  source: z.enum(["live", "delayed", "eod"]),
});

export const CandleSchema = z.object({
  sourceUrl:z.string().url().nullable().optional(),
  securityId: z.string().min(1),
  interval: z.enum(["1m", "5m", "15m", "1h", "1d", "1w", "1M", "1y"]),
  timestamp: isoDate,
  open: nonNegativeNumber,
  high: nonNegativeNumber,
  low: nonNegativeNumber,
  close: nonNegativeNumber,
  volume: nonNegativeNumber,
}).refine((c) => c.high >= c.low, { message: "candle high must be >= low" });

export const FinancialPeriodSchema = z.object({
  id: z.string().min(1),
  securityId: z.string().min(1),
  periodType: z.enum(["annual", "quarterly"]),
  fiscalYear: z.number().int().min(1900).max(2100),
  fiscalQuarter: z.number().int().min(1).max(4).optional(),
  periodEnd: isoDate,
  reportedAt: isoDate,
  currency: z.string().length(3),
});

export const IncomeStatementSchema = z.object({
  periodId: z.string().min(1),
  revenue: nonNegativeNumber,
  costOfRevenue: nonNegativeNumber.optional(),
  grossProfit: finiteNumber.optional(),
  operatingExpenses: nonNegativeNumber.optional(),
  operatingIncome: finiteNumber.optional(),
  netIncome: finiteNumber,
  eps: finiteNumber,
  dilutedEps: finiteNumber.optional(),
  ebitda: finiteNumber.optional(),
});

export const BalanceSheetSchema = z.object({
  periodId: z.string().min(1),
  totalAssets: nonNegativeNumber,
  totalLiabilities: nonNegativeNumber,
  totalEquity: finiteNumber,
  cash: nonNegativeNumber.optional(),
  totalDebt: nonNegativeNumber.optional(),
  currentAssets: nonNegativeNumber.optional(),
  currentLiabilities: nonNegativeNumber.optional(),
  sharesOutstanding: nonNegativeNumber.optional(),
}).refine((b) => Math.abs(b.totalAssets - (b.totalLiabilities + b.totalEquity)) <= Math.max(1, b.totalAssets * 0.02), {
  message: "balance sheet does not balance: assets != liabilities + equity (>2% tolerance)",
});

export const CorporateActionSchema = z.object({
  id: z.string().min(1),
  securityId: z.string().min(1),
  type: z.enum(["dividend", "split", "bonus_issue", "rights_issue", "buyback", "merger", "acquisition", "suspension", "trading_halt"]),
  announcedAt: isoDate,
  exDate: isoDate.optional(),
  recordDate: isoDate.optional(),
  payDate: isoDate.optional(),
  effectiveDate: isoDate.optional(),
  status: z.enum(["announced", "confirmed", "completed", "cancelled"]),
  details: z.record(z.any()),
});

export type ValidationIssue = { path: string; message: string };
