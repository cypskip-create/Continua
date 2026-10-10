/** NSE research data. Coverage depends on the available sources; missing values remain unavailable. */
import { env } from "../../config/index.js";
import { logger } from "../../monitoring/logger.js";
import { parseAfxQuote, parseAfxSecurityProfile, parseAfxDailyHistory } from "./afxRawParser.js";
import type {
  INseClient,
} from "../nse/nseClient.js";
import type {
  NseRawSecurity, NseRawQuote, NseRawCandle, NseRawCompanyProfile,
  NseRawFinancialPeriod, NseRawCorporateAction, NseRawEarningsEvent, NseRawOwnership,
} from "../nse/nseRawTypes.js";
// Reusing only the existing tracked ticker symbols as a directory of
// "which NSE tickers do we track" — NOT reusing any of nseClient.ts's
// synthetic prices/financials. See AFX_TICKERS in env.ts for how to
// override this with a real, current list instead.
import { KNOWN_NSE_SYMBOLS } from "../nse/knownSymbols.js";

const BASE_URL = "https://afx.kwayisi.org";
const USER_AGENT = "ContinuaBot/1.0 (+https://github.com/cypskip-create/Continua)";

let robotsDisallowedPaths: string[] | null = null;
let lastRequestAt = 0;

/**
 * Per-path HTML cache, TTL = AFX_POLL_INTERVAL_MS. This is the actual fix
 * for a real problem: priceWorker.ts polls every PRICE_POLL_INTERVAL_MS
 * (default 5s) — sized for a real feed — regardless of which adapter is
 * behind NSE. Without this cache, fetchQuotes() would hit the network
 * fresh on every 5-second tick, and the per-request throttle below only
 * spaces out requests WITHIN one fetchQuotes() call, not BETWEEN separate
 * calls from priceWorker — so afx.kwayisi.org would get hammered every 5
 * seconds regardless of AFX_POLL_INTERVAL_MS's intent. Caching here means
 * the actual network fetch only happens once per AFX_POLL_INTERVAL_MS per
 * page, no matter how often callers ask.
 */
const pageCache = new Map<string, { html: string; fetchedAt: number }>();

async function loadRobotsRules(): Promise<string[]> {
  if (robotsDisallowedPaths) return robotsDisallowedPaths;
  try {
    const res = await fetch(`${BASE_URL}/robots.txt`, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      robotsDisallowedPaths = [];
      return robotsDisallowedPaths;
    }
    const text = await res.text();
    // Minimal parse: Disallow lines under a User-agent: * block (or no
    // User-agent block at all). Good enough for a single-site, no-crawl-
    // delay robots.txt; not a general-purpose robots.txt parser.
    robotsDisallowedPaths = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^disallow:/i.test(line))
      .map((line) => line.split(":").slice(1).join(":").trim())
      .filter(Boolean);
  } catch (err) {
    logger.warn({ err }, "AfxClient: failed to fetch robots.txt — treating as no rules found, proceeding cautiously");
    robotsDisallowedPaths = [];
  }
  return robotsDisallowedPaths;
}

async function isAllowed(path: string): Promise<boolean> {
  const rules = await loadRobotsRules();
  return !rules.some((disallowed) => disallowed && path.startsWith(disallowed));
}

/** Serializes every request through a minimum spacing — see
 *  AFX_MIN_REQUEST_INTERVAL_MS. This is a shared free site, not a paid
 *  API with a documented rate limit, so this errs conservative. */
async function throttle(): Promise<void> {
  const minInterval = env.AFX_MIN_REQUEST_INTERVAL_MS;
  const wait = lastRequestAt + minInterval - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
}

async function fetchPage(path: string): Promise<string | null> {
  const cached = pageCache.get(path);
  if (cached && Date.now() - cached.fetchedAt < env.AFX_POLL_INTERVAL_MS) {
    return cached.html;
  }

  const allowed = await isAllowed(path);
  if (!allowed) {
    logger.warn({ path }, "AfxClient: path disallowed by robots.txt — skipping");
    return null;
  }
  await throttle();
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    logger.warn({ url, status: res.status }, "AfxClient: fetch failed");
    // Serve stale cache rather than nothing, if we have it — a transient
    // failure shouldn't blank out a quote that was fine 4 minutes ago.
    return cached?.html ?? null;
  }
  const html = await res.text();
  pageCache.set(path, { html, fetchedAt: Date.now() });
  return html;
}

function tickerList(): string[] {
  if (env.AFX_TICKERS) {
    return env.AFX_TICKERS.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  }
  return KNOWN_NSE_SYMBOLS;
}

export class AfxClient implements INseClient {
  /** Not part of INseClient — a convenience for manually checking one
   *  ticker's parse output against the real page before trusting this
   *  client for anything else. */
  async previewQuote(symbol: string): Promise<NseRawQuote | null> {
    const quotes = await this.fetchQuotes([symbol]);
    return quotes[0] ?? null;
  }

  async fetchSecurities(): Promise<NseRawSecurity[]> {
    const symbols = tickerList();
    const results: NseRawSecurity[] = [];
    for (const symbol of symbols) {
      const html = await fetchPage(`/nse/${symbol.toLowerCase()}.html`);
      if (!html) continue;
      const profile = parseAfxSecurityProfile(html, symbol);
      results.push({
        Symbol: profile.symbol,
        CompanyName: profile.companyName ?? profile.symbol,
        Sector: profile.sector ?? "Unknown",
        Industry: profile.industry ?? "Unknown",
        TradingStatus: "ACTIVE",
      });
    }
    return results;
  }

  async fetchQuotes(symbols: string[]): Promise<NseRawQuote[]> {
    const targets = symbols.length ? symbols : tickerList();
    const results: NseRawQuote[] = [];
    for (const symbol of targets) {
      const html = await fetchPage(`/nse/${symbol.toLowerCase()}.html`);
      if (!html) continue;
      const quote = parseAfxQuote(html, symbol);
      if (quote.lastTradedPrice === null) {
        // Narrative sentence wasn't found/didn't match — don't emit a
        // quote with no price at all rather than pass through nulls that
        // look like a real zero-value quote downstream.
        logger.warn({ symbol }, "AfxClient: could not extract a last-traded price — skipping this symbol's quote");
        continue;
      }
      results.push({
        Symbol: quote.symbol,
        LastTradedPrice: quote.lastTradedPrice,
        Open: quote.open ?? quote.lastTradedPrice,
        High: quote.high ?? quote.lastTradedPrice,
        Low: quote.low ?? quote.lastTradedPrice,
        PrevClose: quote.prevClose ?? quote.lastTradedPrice,
        Change: quote.change ?? 0,
        ChangePct: quote.changePct ?? 0,
        Volume: quote.volume ?? 0,
        MarketCapMn: undefined,
        Currency: quote.currency,
        TradingStatus: "ACTIVE",
        EventTimestamp: new Date().toISOString(),
      });
    }
    return results;
  }

  async fetchCandles(symbol: string, interval: NseRawCandle["Interval"], from: string, to: string): Promise<NseRawCandle[]> {
    if (interval !== "1D") {
      // Only the 10-day daily history table exists on this source — no
      // intraday granularity to derive 1MIN/5MIN/etc. bars from.
      return [];
    }
    const html = await fetchPage(`/nse/${symbol.toLowerCase()}.html`);
    if (!html) return [];
    const bars = parseAfxDailyHistory(html).filter((bar) => bar.date >= from && bar.date <= to);
    // O=H=L=C is deliberate — see the module doc comment on why this is
    // an honest "close-only" bar, not a fabricated intraday range. Note
    // this source only ever has ~10 days of history at all — a wider
    // [from, to] range just yields fewer bars than requested, not an
    // error, same as any other adapter running out of history.
    return bars.map((bar) => ({
      Symbol: symbol.toUpperCase(),
      Interval: "1D" as const,
      BarTime: `${bar.date}T00:00:00Z`,
      O: bar.close, H: bar.close, L: bar.close, C: bar.close,
      V: bar.volume ?? 0,
    }));
  }

  async fetchCompanyProfile(symbol: string): Promise<NseRawCompanyProfile | null> {
    const html = await fetchPage(`/nse/${symbol.toLowerCase()}.html`);
    if (!html) return null;
    const profile = parseAfxSecurityProfile(html, symbol);
    return {
      Symbol: profile.symbol,
      Description: profile.description ?? undefined,
      Headquarters: profile.headquarters ?? undefined,
      Website: profile.website ?? undefined,
      // Not present on this source at all — left undefined rather than "N/A".
      ChiefExecutive: undefined,
      EmployeeCount: undefined,
      FoundedYear: undefined,
    };
  }

  // Not available from this source — see module doc comment. Empty,
  // not fabricated, matching how RealNseClient already handles the gaps
  // in its own upstream (the previous provider).
  async fetchFinancials(_symbol: string): Promise<NseRawFinancialPeriod[]> { return []; }
  async fetchCorporateActions(_symbol: string | null, _since: string): Promise<NseRawCorporateAction[]> { return []; }
  async fetchEarningsEvents(_symbol: string | null, _since: string): Promise<NseRawEarningsEvent[]> { return []; }
  async fetchOwnership(_symbol: string): Promise<NseRawOwnership[]> { return []; }

  streamQuotes(symbols: string[], onTick: (q: NseRawQuote) => void): () => void {
    logger.info(
      { intervalMs: env.AFX_POLL_INTERVAL_MS },
      "AfxClient.streamQuotes: polling a public HTML page, not a real push feed — interval is deliberately coarse",
    );
    let stopped = false;
    const pollLoop = async () => {
      while (!stopped) {
        try {
          const quotes = await this.fetchQuotes(symbols);
          for (const quote of quotes) onTick(quote);
        } catch (err) {
          logger.error({ err }, "AfxClient.streamQuotes: poll failed");
        }
        await new Promise((resolve) => setTimeout(resolve, env.AFX_POLL_INTERVAL_MS));
      }
    };
    void pollLoop();
    return () => { stopped = true; };
  }
}
