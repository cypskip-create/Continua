import { useQuery } from "@tanstack/react-query";
import { newsApi } from "@/api/newsApi";
import { isNotFound } from "@/api/client";
import type { NewsItem } from "@/api/types";

/** Real news mentioning a symbol, scraped from configured RSS feeds by
 *  continua-scraper and bridged into market.news_items — from the Data
 *  Layer's `GET /news/:symbol` (see docs/api/API.md). Returns `news: []`
 *  — not an error — when nothing's been scraped yet for this symbol,
 *  same convention as useCompanyAnnouncements, so callers can show an
 *  empty state instead of treating "nothing yet" as a failure. */
export function useSecurityNews(symbol: string | undefined) {
  const query = useQuery({
    queryKey: ["continua", "news", "symbol", symbol],
    queryFn: () => newsApi.getForSymbol(symbol as string),
    enabled: !!symbol,
    staleTime: 5 * 60_000,
    retry: (count, err) => !isNotFound(err) && count < 1,
  });

  return {
    news: (query.data ?? []) as NewsItem[],
    isLoading: query.isLoading,
    isNotCovered: isNotFound(query.error),
  };
}