import { continuaFetch } from "./client";
import type { CorporateAction, OwnershipRecord, UpcomingDividend, RecentEarnings } from "./types";

export const corporateActionsApi = {
  getForSymbol(symbol: string, exchange = "NSE") {
    return continuaFetch<CorporateAction[]>(`/corporate-actions/${encodeURIComponent(symbol)}`, { params: { exchange } });
  },

  getDividends(symbol: string, exchange = "NSE") {
    return continuaFetch<CorporateAction[]>(`/dividends/${encodeURIComponent(symbol)}`, { params: { exchange } });
  },

  /** Market-wide upcoming dividends — see UpcomingDividend for why this is real. */
  getUpcomingDividends(exchange = "NSE", limit = 20) {
    return continuaFetch<UpcomingDividend[]>(`/dividends/upcoming`, { params: { exchange, limit } });
  },

  /** Market-wide recent (already reported) earnings — never predicted. */
  getRecentEarnings(exchange = "NSE", limit = 20) {
    return continuaFetch<RecentEarnings[]>(`/earnings/recent`, { params: { exchange, limit } });
  },

  getOwnership(symbol: string, exchange = "NSE") {
    return continuaFetch<OwnershipRecord[]>(`/ownership/${encodeURIComponent(symbol)}`, { params: { exchange } });
  },
};