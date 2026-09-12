import { useQuery } from "@tanstack/react-query";
import { newsApi } from "@/api/newsApi";
import type { NewsItem } from "@/api/types";

/** Site-wide recent news feed, scraped from configured RSS sources and
 *  bridged into market.news_items — from the Data Layer's `GET /news`
 *  (see docs/api/API.md). Not yet wired into the Media/TradersHub tab
 *  (app/src/components/social/MediaFeed.tsx still reads the curated
 *  MEDIA_ITEMS mock, which also carries video/interview content this
 *  pipeline can't produce) — this hook is the real-data building block
 *  for that follow-up. */
export function useMarketNews(category?: NewsItem["category"]) {
  const query = useQuery({
    queryKey: ["continua", "news", "recent", category ?? "all"],
    queryFn: () => newsApi.listRecent({ category }),
    staleTime: 5 * 60_000,
  });

  return {
    news: (query.data ?? []) as NewsItem[],
    isLoading: query.isLoading,
  };
}