/**
 * Query-param validation, mirroring how ingestion validates incoming data
 * (ingestion/validators/schemas.ts) — the same discipline applied to the
 * other side of the system. A malformed query param now returns a clean
 * 400 with a specific reason instead of an ad-hoc check in each controller
 * (or, worse, silently falling through to a confusing 500).
 */
import { z } from "zod";
import { ACTIVE_EXCHANGES } from "../../config/index.js";

const isoDateString = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "must be a valid ISO 8601 date/time",
});

/** Every endpoint accepts ?exchange=, defaulting to NSE — this is what lets
 *  the same route set serve every future exchange without new routes. */
const ExchangeQuery = z.object({
  exchange: z.enum(ACTIVE_EXCHANGES).default("NSE"),
});

export const QuotesBatchQuerySchema = ExchangeQuery.extend({
  symbols: z.string().min(1, "symbols is required, e.g. ?symbols=SAFCOM,EQTY"),
});

export const HistoricalQuerySchema = ExchangeQuery.extend({
  interval: z.enum(["1m", "5m", "15m", "1h", "1d", "1w", "1M", "1y"]).default("1d"),
  from: isoDateString.optional(),
  to: isoDateString.optional(),
});

export const PerformanceQuerySchema = ExchangeQuery.extend({
  from: isoDateString,
  to: isoDateString.optional(),
});

export const SparklinesQuerySchema = ExchangeQuery.extend({
  symbols: z.string().min(1, "symbols is required, e.g. ?symbols=SAFCOM,EQTY"),
  points: z.coerce.number().int().min(2).max(90).default(20),
});

export const FinancialsQuerySchema = ExchangeQuery.extend({
  periodType: z.enum(["annual", "quarterly"]).default("annual"),
});

export const FinancialsHistoryQuerySchema = FinancialsQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(5),
});

export const MoversQuerySchema = ExchangeQuery.extend({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const AnnouncementsQuerySchema = ExchangeQuery.extend({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const ScreenerQuerySchema = ExchangeQuery.extend({
  sector: z.string().min(1).optional(),
  minMarketCap: z.coerce.number().nonnegative().optional(),
  maxPe: z.coerce.number().optional(),
  minDividendYield: z.coerce.number().optional(),
  minAfriScore: z.coerce.number().min(0).max(100).optional(),
  sortBy: z.enum(["afriScore", "changePercent", "marketCap", "dividendYield", "pe"]).default("afriScore"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const IndicatorQuerySchema = ExchangeQuery.extend({
  type: z.enum(["SMA", "EMA", "RSI", "MACD"]),
  period: z.coerce.number().int().positive().max(500).optional(),
  fast: z.coerce.number().int().positive().max(500).optional(),
  slow: z.coerce.number().int().positive().max(500).optional(),
  signal: z.coerce.number().int().positive().max(500).optional(),
  from: isoDateString.optional(),
  to: isoDateString.optional(),
});

export { ExchangeQuery };