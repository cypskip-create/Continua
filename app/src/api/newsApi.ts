import { continuaFetch } from "./client";
import type { NewsItem } from "./types";

export const newsApi = {
  /** Site-wide recent news feed, optionally filtered by category —
   *  GET /news (see docs/api/API.md). */
  listRecent(opts: { category?: NewsItem["category"]; limit?: number } = {}) {
    const { category, limit = 50 } = opts;
    return continuaFetch<NewsItem[]>(`/news`, {
      params: { ...(category ? { category } : {}), limit },
    });
  },

  /** News mentioning one specific security — GET /news/:symbol. */
  getForSymbol(symbol: string, opts: { exchange?: string; limit?: number } = {}) {
    const { exchange = "NSE", limit = 20 } = opts;
    return continuaFetch<NewsItem[]>(`/news/${encodeURIComponent(symbol)}`, {
      params: { exchange, limit },
    });
  },
};