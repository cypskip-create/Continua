import { Router } from "express";
import { query } from "../../storage/db.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  analyseMarket,
  type MarketObservation,
} from "../../services/research/marketIntelligence.js";

export const marketResearchRoutes = Router();
marketResearchRoutes.get(
  "/market-research/intelligence",
  asyncHandler(async (_req, res) => {
    const result =
      await query<MarketObservation>(`SELECT s.symbol, c.name AS sector, q.change_percent AS "changePercent", q.volume, q.event_timestamp AS timestamp
    FROM market.live_quotes q JOIN market.securities s ON s.id=q.security_id
    JOIN market.companies co ON co.id=s.company_id LEFT JOIN market.sectors c ON c.id=co.sector_id
    WHERE s.exchange='NSE' AND s.status='active' AND q.last_price > 0`);
    res.json({ data: analyseMarket(result.rows) });
  }),
);

marketResearchRoutes.get(
  "/market-research/records",
  asyncHandler(async (_req, res) => {
    // A pending migration is a coverage state, not a broken Markets page. Other DB errors still propagate.
    try {
      const result =
        await query(`SELECT id, kind, title, symbol, observed_at AS "observedAt", source_url AS "sourceUrl", payload
      FROM market.research_records WHERE verified_at IS NOT NULL ORDER BY observed_at DESC LIMIT 2000`);
      res.json({ data: { records: result.rows, available: true } });
    } catch (error) {
      if ((error as { code?: string }).code !== "42P01") throw error;
      res.json({ data: { records: [], available: false } });
    }
  }),
);

marketResearchRoutes.get(
  "/market-research/earnings",
  asyncHandler(async (_req, res) => {
    const result =
      await query(`SELECT e.id, s.symbol, c.name AS "companyName", e.fiscal_year AS "fiscalYear",
    e.fiscal_quarter AS "fiscalQuarter", e.expected_date AS "expectedDate", e.reported_date AS "reportedDate",
    e.eps_actual AS "epsActual", e.eps_estimate AS "epsEstimate", e.revenue_actual AS "revenueActual", e.revenue_estimate AS "revenueEstimate"
    FROM market.earnings_events e JOIN market.securities s ON s.id=e.security_id JOIN market.companies c ON c.id=s.company_id
    WHERE s.exchange='NSE' AND s.status <> 'delisted' ORDER BY COALESCE(e.reported_date,e.expected_date) DESC NULLS LAST LIMIT 300`);
    res.json({ data: result.rows });
  }),
);
