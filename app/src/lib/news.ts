import type { NewsItem } from "@/api/types";

/** Keep cached stories, but never trust old unverified issuer tags. */
export function verifiedNewsItem(item: NewsItem): NewsItem {
  if (item.relevance?.version !== 2 || !Array.isArray(item.relevance.evidence)) return {...item, relevance: undefined, symbols: [], securityIds: []};
  const evidence = item.relevance.evidence.filter(e => typeof e?.evidence === "string" && !!e.evidence.trim() && typeof e.symbol === "string" && item.symbols.includes(e.symbol));
  const supported = new Set(evidence.map(e => e.symbol));
  return {...item, relevance:{...item.relevance,evidence}, symbols: [...new Set(item.symbols.filter(s => supported.has(s)))]};
}

const normalize = (value: string) => value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

export function dedupeNews(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    let url = item.articleUrl.split(/[?#]/)[0]!.replace(/\/$/, "").toLowerCase();
    try { const parsed = new URL(item.articleUrl); url = `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`.toLowerCase(); } catch { /* retain safe fallback */ }
    const keys = [`h:${normalize(item.headline)}`, `u:${url}`];
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
}
