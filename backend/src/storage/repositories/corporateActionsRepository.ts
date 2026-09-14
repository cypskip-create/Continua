import { query } from "../db.js";
import type { CorporateAction, EarningsEvent, OwnershipRecord } from "../../types/market.js";

export const corporateActionsRepository = {
  async upsertCorporateAction(a: CorporateAction): Promise<void> {
    await query(
      `INSERT INTO market.corporate_actions (id, security_id, type, announced_at, ex_date, record_date, pay_date, effective_date, status, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, details = EXCLUDED.details, updated_at = now()`,
      [a.id, a.securityId, a.type, a.announcedAt, a.exDate ?? null, a.recordDate ?? null, a.payDate ?? null,
       a.effectiveDate ?? null, a.status, JSON.stringify(a.details)]
    );
  },

  async getBySecurity(securityId: string): Promise<CorporateAction[]> {
    const res = await query<any>(
      `SELECT id, security_id as "securityId", type, announced_at as "announcedAt", ex_date as "exDate",
              record_date as "recordDate", pay_date as "payDate", effective_date as "effectiveDate", status, details
       FROM market.corporate_actions WHERE security_id = $1 ORDER BY announced_at DESC`,
      [securityId]
    );
    return res.rows;
  },

  async getDividendsBySecurity(securityId: string): Promise<CorporateAction[]> {
    const res = await query<any>(
      `SELECT id, security_id as "securityId", type, announced_at as "announcedAt", ex_date as "exDate",
              record_date as "recordDate", pay_date as "payDate", effective_date as "effectiveDate", status, details
       FROM market.corporate_actions WHERE security_id = $1 AND type = 'dividend' ORDER BY ex_date DESC NULLS LAST`,
      [securityId]
    );
    return res.rows;
  },

  /** Market-wide upcoming dividends for the Markets page calendar — real,
   *  forward-looking data: an ex-date is a fact stated in the company's
   *  own dividend announcement, not a prediction, so this is safe to show
   *  as "upcoming" (unlike earnings — see getRecentEarnings below). Only
   *  returns dividends whose ex_date hasn't passed yet. */
  async getUpcomingDividends(exchange: string, limit = 20): Promise<(CorporateAction & { symbol: string; companyName: string })[]> {
    const res = await query<any>(
      `SELECT ca.id, ca.security_id as "securityId", ca.type, ca.announced_at as "announcedAt", ca.ex_date as "exDate",
              ca.record_date as "recordDate", ca.pay_date as "payDate", ca.effective_date as "effectiveDate",
              ca.status, ca.details, sec.symbol, c.name as "companyName"
       FROM market.corporate_actions ca
       JOIN market.securities sec ON sec.id = ca.security_id
       JOIN market.companies c ON c.id = sec.company_id
       WHERE ca.type = 'dividend' AND sec.exchange = $1 AND ca.ex_date >= CURRENT_DATE
       ORDER BY ca.ex_date ASC
       LIMIT $2`,
      [exchange, limit]
    );
    return res.rows;
  },

  /** Market-wide RECENT (already reported) earnings for the Markets page —
   *  deliberately "recent", never "upcoming": expected_date/eps_estimate
   *  columns exist in the schema but nothing in this system has a real
   *  analyst-estimates source to populate them honestly, so this only
   *  ever surfaces reported_date/eps_actual — facts, not predictions. */
  async getRecentEarnings(exchange: string, limit = 20): Promise<(EarningsEvent & { symbol: string; companyName: string })[]> {
    const res = await query<any>(
      `SELECT ee.id, ee.security_id as "securityId", ee.period_id as "periodId", ee.fiscal_year as "fiscalYear",
              ee.fiscal_quarter as "fiscalQuarter", ee.reported_date as "reportedDate", ee.eps_actual as "epsActual",
              ee.revenue_actual as "revenueActual", sec.symbol, c.name as "companyName"
       FROM market.earnings_events ee
       JOIN market.securities sec ON sec.id = ee.security_id
       JOIN market.companies c ON c.id = sec.company_id
       WHERE sec.exchange = $1 AND ee.reported_date IS NOT NULL
       ORDER BY ee.reported_date DESC
       LIMIT $2`,
      [exchange, limit]
    );
    return res.rows;
  },

  async upsertEarningsEvent(e: EarningsEvent): Promise<void> {
    await query(
      `INSERT INTO market.earnings_events (id, security_id, period_id, fiscal_year, fiscal_quarter, expected_date, reported_date, eps_estimate, eps_actual, revenue_estimate, revenue_actual)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET reported_date = EXCLUDED.reported_date, eps_actual = EXCLUDED.eps_actual, revenue_actual = EXCLUDED.revenue_actual`,
      [e.id, e.securityId, e.periodId ?? null, e.fiscalYear, e.fiscalQuarter ?? null, e.expectedDate ?? null,
       e.reportedDate ?? null, e.epsEstimate ?? null, e.epsActual ?? null, e.revenueEstimate ?? null, e.revenueActual ?? null]
    );
  },

  async upsertOwnership(records: OwnershipRecord[]): Promise<void> {
    for (const r of records) {
      await query(
        `INSERT INTO market.ownership (security_id, holder_name, holder_type, shares_held, percent_held, as_of)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (security_id, holder_name) DO UPDATE SET
           shares_held = EXCLUDED.shares_held, percent_held = EXCLUDED.percent_held, as_of = EXCLUDED.as_of`,
        [r.securityId, r.holderName, r.holderType, r.sharesHeld, r.percentHeld, r.asOf]
      );
    }
  },

  async getOwnership(securityId: string): Promise<OwnershipRecord[]> {
    const res = await query<any>(
      `SELECT security_id as "securityId", holder_name as "holderName", holder_type as "holderType",
              shares_held as "sharesHeld", percent_held as "percentHeld", as_of as "asOf"
       FROM market.ownership WHERE security_id = $1 ORDER BY percent_held DESC`,
      [securityId]
    );
    return res.rows;
  },
};