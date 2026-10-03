/**
 * Finds which listed securities a news article's text mentions.
 *
 * Deliberately a different shape from resolveCompanyEntity.ts, not a
 * wrapper around it: that module resolves ONE declared company name to AT
 * MOST one security (an NSE announcement is filed by exactly one company,
 * so multiple candidates means ambiguous → unresolved). A news article is
 * legitimately about several companies at once ("Safaricom and Airtel
 * both cut data prices..."), so this scans free text and returns EVERY
 * confident match rather than refusing on multiple hits.
 *
 * Still conservative in the same spirit as §12 of the scraper spec: a
 * match requires either the exact ticker symbol as a standalone word
 * (avoids e.g. matching the ticker "CO" inside an unrelated word), or the
 * company's core name (name with generic suffix words like "Plc"/"Group"/
 * "Kenya" stripped) appearing as a whole phrase. No fuzzy/partial/edit-
 * distance matching — a miss (article not tagged to a company it actually
 * mentions) is far preferable to a false tag on a financial news feed.
 *
 * GENERIC_CORE_NAME_BLOCKLIST exists because that conservatism isn't
 * enough on its own: a handful of real NSE core names ARE ordinary
 * English/finance words once suffixes are stripped — Equity Group
 * Holdings (EQTY) -> "equity", Total Kenya (TOTL) -> "total", Express
 * Kenya (XPRS) -> "express", Standard Group (SGL) -> "standard", Jubilee
 * Holdings (JUB) -> "jubilee". Confirmed in production: articles about
 * unrelated tech/startup topics ("equity" as in stock options) were
 * getting tagged as Equity Group mentions purely on that word. Ticker
 * matching alone (EQTY, TOTL, XPRS, SGL, JUB as standalone tokens) stays
 * enabled for these — tickers essentially never collide with prose.
 */
import { query } from "../../storage/db.js";

interface SecurityNameEntry {
  securityId: string;
  symbol: string;
  companyName: string;
}

const SUFFIX_WORDS = new Set([
  "plc", "ltd", "limited", "group", "kenya", "holdings", "co", "company", "incorporated", "inc", "bank",
]);

/** Core names that collapse to ordinary English/finance vocabulary once
 *  suffixes are stripped — too collision-prone for text matching (see
 *  header comment). Add to this list as new false positives surface;
 *  don't try to out-guess it in advance with an exhaustive dictionary —
 *  needs_review exists precisely to surface the ones this list misses. */
const GENERIC_CORE_NAME_BLOCKLIST = new Set([
  "equity", "total", "express", "standard", "jubilee",
  "liberty", "national", "home", "car", "crown", "capital", "mobile", "image", "gold", "bond",
]);

/** Minimum length for a company's stripped core name to be used for
 *  matching — short leftovers ("I&M" -> "i m", or a name that's almost
 *  entirely suffix words) are too collision-prone to match on safely. */
const MIN_CORE_NAME_LENGTH = 4;

function stripToCoreName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !SUFFIX_WORDS.has(word))
    .join(" ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let directoryCache: { exchange: string; entries: SecurityNameEntry[] } | null = null;

async function loadDirectory(exchange: string): Promise<SecurityNameEntry[]> {
  if (directoryCache?.exchange === exchange) return directoryCache.entries;
  const res = await query<SecurityNameEntry>(
    `SELECT s.id as "securityId", s.symbol, c.name as "companyName"
     FROM market.securities s
     JOIN market.companies c ON c.id = s.company_id
     WHERE s.exchange = $1`,
    [exchange],
  );
  directoryCache = { exchange, entries: res.rows };
  return res.rows;
}

/** Call after a batch of securities changes (tests, or a bridge run that
 *  spans a securities sync) so stale entries can't linger for the process
 *  lifetime — the bridge worker runs long-lived, not once-per-process. */
export function clearStockMentionDirectoryCache(): void {
  directoryCache = null;
}

export async function resolveStockMentions(headline: string, articleText: string, exchange: string): Promise<string[]> {
  const title = headline.trim();
  // Entity evidence far down a page is usually a related-story rail or a
  // market ticker, not this article. The scraper already extracts prose;
  // this cap is a second defence for legacy/noisy documents.
  const body = articleText.slice(0, 2_500);
  const text = `${title}\n${body}`;
  if (!text.trim()) return [];
  const directory = await loadDirectory(exchange);
  const matched = new Set<string>();

  for (const entry of directory) {
    // Ticker: standalone word, case-sensitive (lowercase "scom" in prose
    // isn't a confident ticker reference; NSE tickers are always written
    // in caps in practice).
    const escapedTicker = escapeRegExp(entry.symbol);
    const explicitTickerPattern = new RegExp(`(?:\\$${escapedTicker}\\b|\\(${escapedTicker}\\)|\\b${escapedTicker}\\s*:)`);
    const tickerInHeadline = new RegExp(`\\b${escapedTicker}\\b`).test(title);
    if (tickerInHeadline || explicitTickerPattern.test(text)) {
      matched.add(entry.securityId);
      continue;
    }

    const core = stripToCoreName(entry.companyName);
    if (core.length < MIN_CORE_NAME_LENGTH) continue;
    if (GENERIC_CORE_NAME_BLOCKLIST.has(core)) continue;
    const namePattern = new RegExp(`\\b${escapeRegExp(core)}\\b`, "i");
    if (namePattern.test(text)) {
      matched.add(entry.securityId);
    }
  }

  // A genuine company story can mention several issuers, but a dozen
  // matches means a page-wide watchlist leaked into the extraction.
  return matched.size <= 5 ? Array.from(matched) : [];
}
