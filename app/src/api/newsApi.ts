import { continuaFetch } from "./client";
import type { NewsItem } from "./types";
import { verifiedNewsItem } from "@/lib/news";

export const newsApi = {
  /** Site-wide recent news feed, optionally filtered by category —
   *  GET /news (see docs/api/API.md). */
  async listRecent(opts: { category?: NewsItem["category"]; limit?: number } = {}) {
    const { category, limit = 50 } = opts;
    const items = await continuaFetch<NewsItem[]>(`/news`, {
      params: { ...(category ? { category } : {}), limit },
    });
    return items.map(verifiedNewsItem);
  },

  /** Detail payload used by the in-app reader, including extracted text. */
  async getById(id: string) {
    return verifiedNewsItem(await continuaFetch<NewsItem>(`/news/item/${encodeURIComponent(id)}`));
  },

  /** News mentioning one specific security — GET /news/:symbol. */
  async getForSymbol(symbol: string, opts: { exchange?: string; limit?: number } = {}) {
    const { exchange = "NSE", limit = 20 } = opts;
    const items = await continuaFetch<NewsItem[]>(`/news/${encodeURIComponent(symbol)}`, {
      params: { exchange, limit },
    });
    return items.map(verifiedNewsItem).filter(item => item.symbols.includes(symbol.toUpperCase()));
  },
};
