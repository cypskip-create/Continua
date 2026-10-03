import type { NewsItem } from "@/api/types";

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
