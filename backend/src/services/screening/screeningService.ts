/**
 * Powers the stock screener: filter the whole exchange by any combination
 * of quote + ratio + score fields. Kept as one parameterized SQL query
 * rather than N+1 lookups, since screeners are exactly the kind of feature
 * that gets used with wide-open date ranges and no symbol filter.
 */
import { query } from "../../storage/db.js";
import type { ExchangeCode } from "../../config/index.js";

export interface ScreenerFilters {
  exchange: ExchangeCode;
  sector?: string;
  minMarketCap?: number;
  maxPe?: number;
  minDividendYield?: number;
  minAfriScore?: number;
  sortBy?: "afriScore" | "changePercent" | "marketCap" | "dividendYield" | "pe";
  sortDirection?: "asc" | "desc";
  limit?: number;
}

export const screeningService = {
  async screen(filters: ScreenerFilters) {
    const conditions: string[] = ["s.exchange = $1", "s.status = 'active'"];
    const params: unknown[] = [filters.exchange];
    let p = 2;

    // Filters by the sector's stable id/slug (e.g. "banking"), matching what
    // GET /sectors returns as `id` — NOT `sectors.name`, and NOT a
    // nonexistent `sectors.sector_id` column (sectors.id IS the id).
    if (filters.sector) { conditions.push(`LOWER(c.id) = LOWER($${p++})`); params.push(filters.sector); }
    if (filters.minMarketCap != null) { conditions.push(`q.market_cap >= $${p++}`); params.push(filters.minMarketCap); }
    if (filters.maxPe != null) { conditions.push(`r.pe <= $${p++}`); params.push(filters.maxPe); }
    if (filters.minDividendYield != null) { conditions.push(`r.dividend_yield >= $${p++}`); params.push(filters.minDividendYield); }
    if (filters.minAfriScore != null) { conditions.push(`sc.afri_score >= $${p++}`); params.push(filters.minAfriScore); }

    const sortColumn = {
      afriScore: "sc.afri_score", changePercent: "q.change_percent", marketCap: "q.market_cap",
      dividendYield: "r.dividend_yield", pe: "r.pe",
    }[filters.sortBy ?? "afriScore"];
    const direction = filters.sortDirection === "asc" ? "ASC" : "DESC";
    const limit = Math.min(filters.limit ?? 50, 200);

    const res = await query<any>(
      `SELECT s.symbol, s.id as "securityId", co.name as "companyName", c.name as sector,
              q.last_price as "lastPrice", q.change_percent as "changePercent", q.market_cap as "marketCap",
              r.pe, r.pb, r.roe, r.roa, r.net_margin as "netMargin", r.debt_to_equity as "debtToEquity",
              r.payout_ratio as "payoutRatio", r.current_ratio as "currentRatio", r.as_of as "ratiosAsOf",
              r.dividend_yield as "dividendYield", sc.afri_score as "afriScore"
       FROM market.securities s
       JOIN market.companies co ON co.id = s.company_id
       LEFT JOIN market.sectors c ON c.id = co.sector_id
       LEFT JOIN market.live_quotes q ON q.security_id = s.id
       LEFT JOIN market.computed_ratios r ON r.security_id = s.id
       LEFT JOIN market.afri_scores sc ON sc.security_id = s.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY ${sortColumn} ${direction} NULLS LAST
       LIMIT $${p}`,
      [...params, limit]
    );
    return res.rows;
  },
};
