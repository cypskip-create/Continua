import { useQuery } from "@tanstack/react-query";
import { newsApi } from "@/api/newsApi";
import type { NewsItem } from "@/api/types";

/** Real news for the Home page's "Latest Updates" strip. When the person
 *  has a portfolio/watchlist, fetches news for each of those symbols in
 *  parallel and merges — there's no backend endpoint for "news mentioning
 *  ANY of these N symbols" today, and for a typical portfolio/watchlist
 *  size (a handful to a few dozen), N parallel per-symbol requests is
 *  simpler than adding one. Falls back to the general market feed for a
 *  signed-out visitor or an empty portfolio/watchlist, so the section is
 *  never empty by default — same fallback shape the old mock-data version
 *  had, just backed by real scraped news now. */
export function useFollowedNews(symbols: string[], limit = 5) {
  const key = [...symbols].sort().join(",");
  const query = useQuery({
    queryKey: ["continua", "news", "followed", key, limit],
    queryFn: async () => {
      if (symbols.length === 0) {
        return newsApi.listRecent({ limit });
      }
      const results = await Promise.all(symbols.map((s) => newsApi.getForSymbol(s, { limit }).catch(() => [] as NewsItem[])));
      const merged = new Map<string, NewsItem>();
      for (const items of results) for (const item of items) merged.set(item.id, item);
      return Array.from(merged.values())
        .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
        .slice(0, limit);
    },
    staleTime: 5 * 60_000,
  });

  return { news: query.data ?? [], isLoading: query.isLoading };
}