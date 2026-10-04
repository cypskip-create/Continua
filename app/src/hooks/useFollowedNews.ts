import { useMarketNews } from "./useMarketNews";
import { dedupeNews } from "@/lib/news";

/** Home and Media share one request/cache. No per-holding request fan-out. */
export function useFollowedNews(_symbols: string[], limit = 5) {
  const feed = useMarketNews();
  return { ...feed, news: dedupeNews(feed.news).slice(0,limit) };
}
