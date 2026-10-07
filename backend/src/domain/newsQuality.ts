import type { NewsItem } from "../types/market.js";

export { isFinancialNews } from "./financialNews.js";

export function normalizeNewsHeadline(value: string): string {
  return value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function canonicalNewsUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return value.split(/[?#]/)[0]!.replace(/\/$/, "").toLowerCase();
  }
}

const MENU_TERMS = /\b(home|factcheck|person of interest|election watch|sports|throw back|word of the day|brand voice|careers|leadership|lifestyle|inspiration|self-help)\b/gi;

export function cleanArticleContent(headline: string, value: string | null | undefined): string | null {
  if (!value) return null;
  const normalizedHeadline = normalizeNewsHeadline(headline);
  const lines = value.split(/\n+/).map((line) => line.replace(/\s+/g, " ").trim()).filter((line) => {
    if (line.length < 20 || normalizeNewsHeadline(line) === normalizedHeadline) return false;
    const menuMatches = line.match(MENU_TERMS)?.length ?? 0;
    return menuMatches < 4;
  });
  const unique = lines.filter((line, index) => lines.findIndex((candidate) => normalizeNewsHeadline(candidate) === normalizeNewsHeadline(line)) === index);
  return unique.join("\n\n") || null;
}

/** Prefer one verified receipt; never union old tags into its evidence. */
export function dedupeNewsItems(items: NewsItem[]): NewsItem[] {
  const byKey = new Map<string, NewsItem>();
  for (const item of items) {
    const headlineKey = normalizeNewsHeadline(item.headline);
    const urlKey = canonicalNewsUrl(item.articleUrl);
    const existingKey = [...byKey.entries()].find(([, candidate]) =>
      normalizeNewsHeadline(candidate.headline) === headlineKey || canonicalNewsUrl(candidate.articleUrl) === urlKey,
    )?.[0];
    if (!existingKey) {
      byKey.set(`${headlineKey}|${urlKey}`, item);
      continue;
    }
    const previous = byKey.get(existingKey)!;
    const prefer = (item.content?.length ?? item.excerpt?.length ?? 0) > (previous.content?.length ?? previous.excerpt?.length ?? 0) ? item : previous;
    byKey.set(existingKey, {
      ...prefer,
      symbols: prefer.symbols,
      securityIds: prefer.securityIds,
    });
  }
  return [...byKey.values()];
}
