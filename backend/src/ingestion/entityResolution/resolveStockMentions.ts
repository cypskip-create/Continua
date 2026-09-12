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

/** Minimum length for a company's stripped core name to be used for
 *  matching — short leftovers ("I&M" -> "i m", or a name that's almost
 *  entirely suffix words) are too collision-prone to match on safely.
 *
 * KNOWN LIMITATION, documented rather than "solved": this is keyword
 * matching, not NLP. A handful of core names ARE ordinary finance
 * vocabulary too ("Equity" for Equity Group, "Total" for Total Kenya) —
 * an article using that word in its generic sense ("shareholders'
 * equity") will false-positive as a mention. Precision/recall tradeoff
 * inherent to this approach; needs_review exists partly to make
 * under- and over-tagged articles visible for a human to correct rather
 * than silently trusted either way. */
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

export async function resolveStockMentions(text: string, exchange: string): Promise<string[]> {
  if (!text.trim()) return [];
  const directory = await loadDirectory(exchange);
  const matched = new Set<string>();

  for (const entry of directory) {
    // Ticker: standalone word, case-sensitive (lowercase "scom" in prose
    // isn't a confident ticker reference; NSE tickers are always written
    // in caps in practice).
    const tickerPattern = new RegExp(`\\b${escapeRegExp(entry.symbol)}\\b`);
    if (tickerPattern.test(text)) {
      matched.add(entry.securityId);
      continue;
    }

    const core = stripToCoreName(entry.companyName);
    if (core.length < MIN_CORE_NAME_LENGTH) continue;
    const namePattern = new RegExp(`\\b${escapeRegExp(core)}\\b`, "i");
    if (namePattern.test(text)) {
      matched.add(entry.securityId);
    }
  }

  return Array.from(matched);
}