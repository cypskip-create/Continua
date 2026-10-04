import { useQuery } from "@tanstack/react-query";
import { newsApi } from "@/api/newsApi";
import type { NewsItem } from "@/api/types";
import { useMemo } from "react";

const NEWS_CACHE = 'continua:financial-news:v1';
function savedNews(): { items: NewsItem[]; savedAt: number } | undefined {
  try {
    const cached = JSON.parse(localStorage.getItem(NEWS_CACHE) ?? 'null');
    if (cached && Array.isArray(cached.items) && cached.items.length <= 50 &&
        cached.items.every((item: NewsItem) => typeof item?.id === 'string' && typeof item?.headline === 'string' && Array.isArray(item?.symbols)) &&
        Number.isFinite(cached.savedAt) && cached.savedAt <= Date.now() && Date.now() - cached.savedAt < 86400000) return cached;
  } catch { /* Storage is optional. */ }
}

/** Site-wide recent news feed, scraped from configured RSS sources and
 *  bridged into market.news_items — from the Data Layer's `GET /news`
 *  (see docs/api/API.md). Used by the Media/TradersHub feed. */
export function useMarketNews(category?: NewsItem["category"]) {
  const snapshot = useMemo(savedNews, []);
  const query = useQuery({
    queryKey: ["continua", "news", "recent", "all"],
    queryFn: async () => {
      const items = await newsApi.listRecent();
      try { localStorage.setItem(NEWS_CACHE, JSON.stringify({items, savedAt: Date.now()})); } catch { /* Quota/private browsing */ }
      return items;
    },
    initialData: snapshot?.items,
    initialDataUpdatedAt: snapshot?.savedAt,
    refetchOnMount: 'always',
    retry: 1,
    staleTime: 5 * 60_000,
  });

  return {
    news: ((query.data ?? []) as NewsItem[]).filter(item => !category || item.category === category),
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
