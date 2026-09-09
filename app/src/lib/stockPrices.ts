// Company reference data lives in data/nseSecurities.ts, verified against
// Mansa's real /exchanges/NSE/stocks response — names/sectors/aliases below
// are derived from that file, not hand-duplicated, so they can't drift out
// of sync. Live price/change/volume/market cap are NOT here — see the note
// further down on why that data was removed from this file.
//
// EVERY function in this file that a component calls for a ticker's name,
// sector, or dividend yield resolves through data/nseSecurities.ts (directly
// or via ALIAS_OF). No other file in the app should declare its own ticker
// literal — if a component needs stock reference data, it imports a
// function from here instead.

import { NSE_SECURITIES, LEGACY_TICKER_ALIASES, NSE_TICKER_SET } from "@/data/nseSecurities";
export { NSE_TICKER_SET };

// Trailing dividend yield (%) — used for portfolio income estimates. Mansa's
// stocks endpoint doesn't return this, so only the handful Continua has
// verified real figures for are listed; everything else correctly falls
// back to 0 via getDivYield() rather than a fabricated number.
export const DIV_YIELD: Record<string, number> = {
  SCOM: 6.4, EQTY: 8.2, KCB: 9.1, SCBK: 10.4, COOP: 6.1,
  EABL: 5.2, ABSA: 9.6, NCBA: 8.4, BRIT: 1.8, KPLC: 0.0,
  BAT: 11.2, JUB: 3.4, DTK: 4.6, SBIC: 7.5, TOTL: 4.0,
  KEGN: 2.8, CIC: 2.5, WTK: 4.8, KUKZ: 5.5, SASN: 4.1,
};

// Sector + display name — the shared metadata behind every "All Stocks" /
// screener / heatmap surface, and the canonical source for STOCK_NAMES below
// so a company's name is only ever typed out in one place (data/nseSecurities.ts).
export const STOCK_META: Record<string, { name: string; sector: string }> = Object.fromEntries(
  NSE_SECURITIES.map((s) => [s.ticker, { name: s.name, sector: s.sector }])
);

// Legacy/colloquial spellings (SAFCOM, DTB, STANBIC, KAKZ, UMEME, CARBACID,
// SAMR) still used in some UI copy — resolved transparently by
// getPrice/getStockName/getStockSector/getStockFundamentals below, so
// existing call sites using the old spelling keep working without needing
// to be individually rewritten.
export const ALIAS_OF: Record<string, string> = LEGACY_TICKER_ALIASES;
export const CANONICAL_SYMBOLS = NSE_SECURITIES.map((s) => s.ticker);

// Thin, name-only view over STOCK_META — kept so existing call sites that
// just want a label (quick-watch marquee, home widgets, etc.) don't need to
// know about sectors too. Derived, not hand-typed, so it can't drift.
export const STOCK_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(STOCK_META).map(([symbol, meta]) => [symbol, meta.name])
);

/** Resolves a legacy/colloquial spelling (SAFCOM, DTB, STANBIC...) to its real
 *  Mansa ticker, or returns the input unchanged if it's already canonical (or
 *  unrecognized). Every getter below normalizes through this first — this is
 *  the ONE place that needs to know about legacy spellings, instead of every
 *  data object needing a duplicate entry for each alias. */
const resolveTicker = (symbol: string): string => {
  const key = symbol?.toUpperCase();
  return (key && ALIAS_OF[key]) || key;
};

export const getStockName = (symbol: string, fallback?: string): string => {
  const key = resolveTicker(symbol);
  return (key && STOCK_NAMES[key]) || fallback || symbol;
};

export const getStockSector = (symbol: string, fallback?: string): string => {
  const key = resolveTicker(symbol);
  return (key && STOCK_META[key]?.sector) || fallback || "Other";
};

// ─────────────────────────────────────────────────────────────────────────
// Price/change/fundamentals fabrication (MOCK_PRICES, PREV_CLOSE, getPrice,
// getPrevClose, getDayChange, getMoneyFlowM, getRangeChangePct's 1D case,
// generateFundamentals) was removed from this file — it was a silent
// fallback that made up numbers whenever live data wasn't loaded yet,
// which is exactly the fabrication this project rules out everywhere else.
// Real price/change/volume/market cap now come ONLY from useLiveQuotes
// (backend/scraper-sourced, see hooks/useLiveQuotes.tsx); callers render a
// loading skeleton while that data is in flight rather than a fake number.
// P/E, beta, and multi-day/week/month/YTD % change are not yet backed by a
// real data source at all — see getStockFundamentals below for the current
// status of each field.
// ─────────────────────────────────────────────────────────────────────────

export const getDivYield = (symbol: string): number => {
  const key = resolveTicker(symbol);
  return key && DIV_YIELD[key] != null ? DIV_YIELD[key] : 0;
};

export type ChangeRange = "1D" | "1W" | "1M" | "YTD";

export interface PortfolioLike {
  symbol: string;
  shares: number;
  avg_cost: number;
}

/** Portfolio totals from REAL live quotes only. A holding whose symbol
 *  isn't in `liveQuotes` yet (not loaded, or outside the tracked universe)
 *  is excluded from totalValue/todayGain rather than priced at a fabricated
 *  number — callers should show those holdings as "pricing…" individually
 *  (see the `pricedCount` return) rather than let them silently skew the
 *  portfolio total. */
export function computePortfolioStats(
  portfolio: PortfolioLike[],
  liveQuotes?: Record<string, { price: number; dayChangeAbs: number }>
) {
  let totalValue = 0;
  let totalCost = 0;
  let todayGain = 0;
  let pricedCount = 0;
  portfolio.forEach((h) => {
    const quote = liveQuotes?.[h.symbol.toUpperCase()];
    if (!quote) {
      totalCost += h.avg_cost * h.shares; // cost basis is always known; only the live price isn't
      return;
    }
    pricedCount += 1;
    totalValue += quote.price * h.shares;
    totalCost += h.avg_cost * h.shares;
    todayGain += quote.dayChangeAbs * h.shares;
  });
  const totalGain = totalValue - totalCost;
  const gainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const prevValue = totalValue - todayGain;
  const todayPct = prevValue > 0 ? (todayGain / prevValue) * 100 : 0;
  return {
    totalValue, totalCost, totalGain, gainPct, todayGain, todayPct,
    pricedCount, isFullyPriced: pricedCount === portfolio.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Extended per-symbol stats (P/E, beta, avg volume) — STILL FABRICATED.
// Market cap and current-day volume are real (they're on the live Quote
// object from useLiveQuotes — use quote.marketCap / quote.volume instead
// of anything from here for those two fields). P/E, beta, and average
// volume have no real backing data source yet (the fundamentals ingestion
// pipeline doesn't compute a trailing P/E or beta today, and AfxClient's
// per-symbol page doesn't expose average volume) — flagged as a follow-up,
// not silently left in place. Every caller of getStockFundamentals below
// should treat pe/beta/avgVolume as illustrative-only and label them as
// such in the UI (e.g. an "est." tag) until a real source exists.
// ─────────────────────────────────────────────────────────────────────────

export interface StockFundamentals {
  pe: number;
  beta: number;
  avgVolume: string;
}

/** Stable per-symbol seed for deterministic (but plausible) mock stats. */
export const tickerSeed = (s: string): number =>
  s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);

const fundamentalsCache = new Map<string, StockFundamentals>();

/** @deprecated pe/beta/avgVolume are illustrative placeholders, not real
 *  data — see the module doc comment above. Label any UI using this as
 *  "est." and prefer real fields (quote.marketCap, quote.volume) wherever
 *  possible. */
export function getStockFundamentals(symbol: string): StockFundamentals {
  const canonicalKey = resolveTicker(symbol);
  if (fundamentalsCache.has(canonicalKey)) return fundamentalsCache.get(canonicalKey)!;
  const seed = tickerSeed(canonicalKey);
  const f: StockFundamentals = {
    pe: +(6 + (seed % 16)).toFixed(1),
    beta: +(0.6 + (seed % 90) / 100).toFixed(2),
    avgVolume: `${(0.04 + (seed % 120) / 100).toFixed(2)}M`,
  };
  fundamentalsCache.set(canonicalKey, f);
  return f;
}

/** Parses magnitude-suffixed strings ("1.2T", "285B", "850K") into a comparable number.
 *  Plain parseFloat() silently drops the K/M/B/T suffix, which breaks any sort that
 *  compares two of these strings — use this instead whenever sorting/ranking by
 *  market cap or volume. */
export function parseMagnitude(value: string | number): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const match = value.trim().match(/^([\d.]+)\s*([KMBT])?$/i);
  if (!match) return parseFloat(value) || 0;
  const num = parseFloat(match[1]);
  const suffix = (match[2] || "").toUpperCase();
  const mult = suffix === "T" ? 1e12 : suffix === "B" ? 1e9 : suffix === "M" ? 1e6 : suffix === "K" ? 1e3 : 1;
  return num * mult;
}

/** A date N days from "now", so mock calendars (earnings, dividends, IPOs) always
 *  read as current/upcoming instead of drifting into the past as real time passes. */
export function relativeDate(daysOffset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d;
}