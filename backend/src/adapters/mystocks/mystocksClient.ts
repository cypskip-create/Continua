/**
 * INseClient backed by live.mystocks.co.ke's own internal JSON quote
 * endpoint — NOT the rendered HTML page, which loads the price
 * asynchronously via JS after page load (confirmed 2026-09-10: a plain
 * fetch of https://live.mystocks.co.ke/stock={TICKER} returns only the
 * page shell; the actual price data comes from a follow-up XHR).
 *
 * The real endpoint, found via browser DevTools Network tab:
 *   GET https://live.mystocks.co.ke/x/f{unixSeconds}-{TICKER}
 *   Accept: application/json
 *   Referer: https://live.mystocks.co.ke/stock={TICKER}
 *
 * The `f{unixSeconds}` prefix is a cache-buster, not an auth token —
 * confirmed by calling it from a clean shell with `Math.floor(Date.now()/1000)`
 * and getting back a fresh, current quote (verified live against real
 * COOP prices, 2026-09-10 — see conversation/ops notes, not fabricated).
 *
 * Response shape (verified against two real, timestamped COOP snapshots
 * ~6 minutes apart, cross-checked against the labelled fields visible on
 * the rendered page for a different ticker, NSE the exchange itself):
 *   {
 *     "reload": 0, "stamp": 1789023548, "track": 65491815,
 *     "time": "9:59 AM EAT", "update": 30, "klass": "c1", "market": "open",
 *     "data": [
 *       "37.60",        // [0]  Last traded price
 *       "0.25 (0.66%)", // [1]  |Change| (|%|) — UNSIGNED. Sign must be
 *                       //      derived from Last vs PrevClose, NOT parsed
 *                       //      from this string, since "klass" does not
 *                       //      reliably encode direction (both an up and
 *                       //      a down sample observed the same "c1").
 *       "37.85",        // [2]  Previous close
 *       "37.60",        // [3]  duplicate of [0] in every sample seen —
 *                       //      unclear purpose, ignored
 *       "37.70",        // [4]  Open (constant across same-day samples)
 *       "37.95",        // [5]  Day high (constant across same-day samples
 *                       //      taken minutes apart — matches "High" label
 *                       //      on the rendered page for a cross-checked
 *                       //      ticker)
 *       "37.50",        // [6]  Day low (same reasoning as High)
 *       "516,703",      // [7]  Volume (comma-grouped integer, shares)
 *       "19.60M",       // [8]  Turnover (abbreviated currency string)
 *       "135",          // [9]  Deals
 *       "222.66B",      // [10] Market cap (abbreviated currency string,
 *                       //      stable across minutes — not used here,
 *                       //      left for a future fundamentals pass)
 *       "9:59 AM EAT",  // [11] Time-of-quote, duplicate of top-level "time"
 *       "37.60",        // [12] Bid
 *       "37.70",        // [13] Ask
 *       "1,200",        // [14] Bid size
 *       "3,567",        // [15] Ask size
 *       "114,973",      // [16] unclear — not used
 *       "978,217"       // [17] unclear — not used
 *     ]
 *   }
 *
 * Only [0], [2], [4], [5], [6], [7] are used below — the fields this
 * client is confident about. [16]/[17] are passed through as unknown
 * rather than guessed at, per this project's no-fabrication rule.
 *
 * VERIFICATION STATUS: confirmed against 2 real tickers (COOP, NSE) at
 * time of writing. The array-index mapping is inferred from those
 * samples, not from any published schema (there isn't one — this is an
 * undocumented internal endpoint of a third-party site). If a future
 * quote looks structurally odd (e.g. Open/High/Low suddenly differing
 * wildly from Last), re-verify against the rendered page for that ticker
 * before trusting it.
 */
import { logger } from "../../monitoring/logger.js";
import type { INseClient } from "../nse/nseClient.js";
import type {
  NseRawSecurity, NseRawQuote, NseRawCandle, NseRawCompanyProfile,
  NseRawFinancialPeriod, NseRawCorporateAction, NseRawEarningsEvent, NseRawOwnership,
} from "../nse/nseRawTypes.js";
import { KNOWN_NSE_SYMBOLS } from "../nse/knownSymbols.js";

const BASE_URL = "https://live.mystocks.co.ke";
const USER_AGENT = "Mozilla/5.0 (compatible; ContinuaBot/1.0; +https://github.com/cypskip-create/Continua)";

/**
 * Our canonical ticker (used throughout this codebase's mock data,
 * screener, and UI) doesn't always match mystocks.co.ke's own URL slug
 * for the same company. Only add entries here when they differ —
 * everything else uses the canonical symbol as-is.
 */
const SYMBOL_TO_MYSTOCKS_SLUG: Record<string, string> = {
  DTB: "DTK",       // Diamond Trust Bank Kenya
  STANBIC: "SBIC",  // Stanbic Holdings
};

function toSlug(symbol: string): string {
  return SYMBOL_TO_MYSTOCKS_SLUG[symbol] ?? symbol;
}

interface MyStocksQuoteResponse {
  reload: number;
  stamp: number; // unix seconds
  track: number;
  time: string;
  update: number;
  klass: string;
  market: "open" | "closed" | string;
  data: string[];
}

function parseNumber(raw: string | undefined): number {
  if (!raw) return 0;
  return Number(raw.replace(/,/g, "")) || 0;
}

/** Per-symbol cache so a burst of fetchQuotes() calls close together
 *  (e.g. priceWorker's poll interval) doesn't hammer the endpoint more
 *  than the site's own "update" cadence (30s, per observed responses). */
const CACHE_TTL_MS = 30_000;
const quoteCache = new Map<string, { quote: NseRawQuote; fetchedAt: number }>();

async function fetchOneQuote(symbol: string): Promise<NseRawQuote | null> {
  const cached = quoteCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.quote;

  const slug = toSlug(symbol);
  const cacheBuster = Math.floor(Date.now() / 1000);
  const url = `${BASE_URL}/x/f${cacheBuster}-${slug}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Referer: `${BASE_URL}/stock=${slug}`,
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    logger.warn({ symbol, err: err instanceof Error ? err.message : err }, "MyStocksClient: fetch failed");
    return null;
  }

  if (!res.ok) {
    logger.warn({ symbol, status: res.status }, "MyStocksClient: non-OK response");
    return null;
  }

  let parsed: MyStocksQuoteResponse;
  try {
    parsed = (await res.json()) as MyStocksQuoteResponse;
  } catch {
    logger.warn({ symbol }, "MyStocksClient: response wasn't valid JSON");
    return null;
  }

  const d = parsed.data;
  if (!Array.isArray(d) || d.length < 7) {
    logger.warn({ symbol, data: d }, "MyStocksClient: unexpected data shape");
    return null;
  }

  const last = parseNumber(d[0]);
  const prevClose = parseNumber(d[2]);
  const open = parseNumber(d[4]);
  const high = parseNumber(d[5]);
  const low = parseNumber(d[6]);
  const volume = Math.round(parseNumber(d[7]));

  // Sign derived from actual prices, NOT from the unsigned "X (Y%)"
  // string in d[1] or from "klass" — see file header comment for why.
  const change = prevClose ? last - prevClose : 0;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;

  const quote: NseRawQuote = {
    Symbol: symbol,
    LastTradedPrice: last,
    Open: open,
    High: high,
    Low: low,
    PrevClose: prevClose,
    Change: Math.round(change * 100) / 100,
    ChangePct: Math.round(changePct * 100) / 100,
    Volume: volume,
    Currency: "KES",
    // "market open/closed" here refers to the exchange's trading session,
    // not this security's own trading status (suspended/halted/delisted),
    // which this source doesn't expose — so this is always "ACTIVE"
    // unless a future pass finds a real per-security status field.
    TradingStatus: "ACTIVE",
    EventTimestamp: new Date(parsed.stamp * 1000).toISOString(),
  };

  quoteCache.set(symbol, { quote, fetchedAt: Date.now() });
  return quote;
}

export class MyStocksClient implements INseClient {
  async fetchSecurities(): Promise<NseRawSecurity[]> {
    // No verified way to enumerate the market from this source beyond the
    // ticker directory already tracked elsewhere in this codebase (see
    // knownSymbols.ts doc comment) — same approach AfxClient takes.
    return KNOWN_NSE_SYMBOLS.map((symbol) => ({
      Symbol: symbol,
      ISIN: "",
      CompanyName: symbol,
      Sector: "Unknown",
      Industry: "Unknown",
      ListingDate: "1990-01-01",
      TradingStatus: "ACTIVE",
    }));
  }

  async fetchQuotes(symbols: string[]): Promise<NseRawQuote[]> {
    const targets = symbols.length ? symbols : KNOWN_NSE_SYMBOLS;
    // Fetched with limited concurrency rather than Promise.all on
    // everything at once — polite to a free, undocumented endpoint, and
    // avoids looking like a burst/DoS pattern that could get IP-blocked
    // the same way afx.kwayisi.org apparently blocks datacenter traffic.
    const CONCURRENCY = 5;
    const results: NseRawQuote[] = [];
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map((symbol) => fetchOneQuote(symbol)));
      for (const q of batchResults) if (q) results.push(q);
    }
    return results;
  }

  // Not yet implemented against this source — see project convention
  // (afxClient.ts, RealNseClient) of returning empty rather than
  // fabricating data the source doesn't actually provide. The site does
  // have a "Historical Prices" and "Financials" page per ticker
  // (https://live.mystocks.co.ke/stock={TICKER}?historical /
  // ?financials) that could support these in a follow-up pass, but their
  // response shape hasn't been verified yet.
  async fetchCandles(_symbol: string, _interval: NseRawCandle["Interval"], _from: string, _to: string): Promise<NseRawCandle[]> {
    return [];
  }
  async fetchCompanyProfile(_symbol: string): Promise<NseRawCompanyProfile | null> {
    return null;
  }
  async fetchFinancials(_symbol: string): Promise<NseRawFinancialPeriod[]> {
    return [];
  }
  async fetchCorporateActions(_symbol: string | null, _since: string): Promise<NseRawCorporateAction[]> {
    return [];
  }
  async fetchEarningsEvents(_symbol: string | null, _since: string): Promise<NseRawEarningsEvent[]> {
    return [];
  }
  async fetchOwnership(_symbol: string): Promise<NseRawOwnership[]> {
    return [];
  }

  streamQuotes(symbols: string[], onTick: (q: NseRawQuote) => void): () => void {
    const targets = symbols.length ? symbols : KNOWN_NSE_SYMBOLS;
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      const quotes = await this.fetchQuotes(targets);
      for (const q of quotes) onTick(q);
    };
    poll();
    // Polling at the cache TTL rather than PRICE_POLL_INTERVAL_MS (which
    // defaults to 5s, sized for a real push feed) — no point polling
    // faster than this source's own ~30s update cadence, and it avoids
    // hammering a free third-party endpoint for nothing.
    const interval = setInterval(poll, CACHE_TTL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }
}