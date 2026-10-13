import { query } from "../db.js";
// Reviewed statements outrank an older calendar snapshot, including genuinely
// missing fields. Do not COALESCE a missing reviewed EPS back to a stale number.
const reviewedEarningsJoin = `LEFT JOIN LATERAL (
  SELECT p.id, p.reported_at, i.eps, i.revenue
  FROM market.financial_periods p
  JOIN market.income_statements i ON i.period_id = p.id
  WHERE p.security_id = ee.security_id AND p.fiscal_year = ee.fiscal_year
    AND p.fiscal_quarter IS NOT DISTINCT FROM ee.fiscal_quarter
    AND p.period_type = CASE WHEN ee.fiscal_quarter IS NULL THEN 'annual' ELSE 'quarterly' END
    AND p.period_end <= CURRENT_DATE AND p.reported_at <= CURRENT_DATE
    AND EXISTS (SELECT 1 FROM market.filing_history_reviews r WHERE r.period_id = p.id)
  ORDER BY p.reported_at DESC LIMIT 1
) reviewed ON TRUE`;
export const corporateActionsRepository = {
    async upsertCorporateAction(a) {
        await query(`INSERT INTO market.corporate_actions (id, security_id, type, announced_at, ex_date, record_date, pay_date, effective_date, status, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, details = EXCLUDED.details, updated_at = now()`, [a.id, a.securityId, a.type, a.announcedAt, a.exDate ?? null, a.recordDate ?? null, a.payDate ?? null,
            a.effectiveDate ?? null, a.status, JSON.stringify(a.details)]);
    },
    async getBySecurity(securityId) {
        const res = await query(`SELECT id, security_id as "securityId", type, announced_at as "announcedAt", ex_date as "exDate",
              record_date as "recordDate", pay_date as "payDate", effective_date as "effectiveDate", status, details
       FROM market.corporate_actions WHERE security_id = $1 ORDER BY announced_at DESC`, [securityId]);
        return res.rows;
    },
    async getDividendsBySecurity(securityId) {
        const res = await query(`SELECT id, security_id as "securityId", type, announced_at as "announcedAt", ex_date as "exDate",
              record_date as "recordDate", pay_date as "payDate", effective_date as "effectiveDate", status, details
       FROM market.corporate_actions WHERE security_id = $1 AND type = 'dividend' ORDER BY ex_date DESC NULLS LAST`, [securityId]);
        return res.rows;
    },
    /** Market-wide upcoming dividends for the Markets page calendar — real,
     *  forward-looking data: an ex-date is a fact stated in the company's
     *  own dividend announcement, not a prediction, so this is safe to show
     *  as "upcoming" (unlike earnings — see getRecentEarnings below). Only
     *  returns dividends whose ex_date hasn't passed yet. */
    async getUpcomingDividends(exchange, limit = 20) {
        const res = await query(`SELECT ca.id, ca.security_id as "securityId", ca.type, ca.announced_at as "announcedAt", ca.ex_date as "exDate",
              ca.record_date as "recordDate", ca.pay_date as "payDate", ca.effective_date as "effectiveDate",
              ca.status, ca.details, sec.symbol, c.name as "companyName"
       FROM market.corporate_actions ca
       JOIN market.securities sec ON sec.id = ca.security_id
       JOIN market.companies c ON c.id = sec.company_id
       WHERE ca.type = 'dividend' AND sec.exchange = $1 AND ca.ex_date >= CURRENT_DATE
       ORDER BY ca.ex_date ASC
       LIMIT $2`, [exchange, limit]);
        return res.rows;
    },
    /** Market-wide RECENT (already reported) earnings for the Markets page —
     *  deliberately "recent", never "upcoming": expected_date/eps_estimate
     *  columns exist in the schema but nothing in this system has a real
     *  analyst-estimates source to populate them honestly, so this only
     *  ever surfaces reported_date/eps_actual — facts, not predictions. */
    async getRecentEarnings(exchange, limit = 20) {
        const res = await query(`SELECT ee.id, ee.security_id as "securityId", ee.period_id as "periodId", ee.fiscal_year as "fiscalYear",
              ee.fiscal_quarter as "fiscalQuarter", CASE WHEN reviewed.id IS NOT NULL THEN reviewed.reported_at ELSE ee.reported_date END as "reportedDate",
              CASE WHEN reviewed.id IS NOT NULL THEN reviewed.eps ELSE ee.eps_actual END as "epsActual",
              CASE WHEN reviewed.id IS NOT NULL THEN reviewed.revenue ELSE ee.revenue_actual END as "revenueActual", sec.symbol, c.name as "companyName"
       FROM market.earnings_events ee
       JOIN market.securities sec ON sec.id = ee.security_id
       JOIN market.companies c ON c.id = sec.company_id
       ${reviewedEarningsJoin}
       WHERE sec.exchange = $1 AND sec.status <> 'delisted'
         AND (reviewed.id IS NOT NULL OR ee.reported_date <= CURRENT_DATE)
       ORDER BY COALESCE(reviewed.reported_at, ee.reported_date) DESC
       LIMIT $2`, [exchange, limit]);
        return res.rows;
    },
    async getEarningsBySecurity(securityId, limit = 12) {
        const res = await query(`SELECT ee.id, ee.security_id as "securityId", COALESCE(reviewed.id, ee.period_id) as "periodId",
              ee.fiscal_year as "fiscalYear", ee.fiscal_quarter as "fiscalQuarter",
              ee.expected_date as "expectedDate", CASE WHEN reviewed.id IS NOT NULL THEN reviewed.reported_at ELSE ee.reported_date END as "reportedDate",
              ee.eps_estimate as "epsEstimate", CASE WHEN reviewed.id IS NOT NULL THEN reviewed.eps ELSE ee.eps_actual END as "epsActual",
              ee.revenue_estimate as "revenueEstimate", CASE WHEN reviewed.id IS NOT NULL THEN reviewed.revenue ELSE ee.revenue_actual END as "revenueActual"
       FROM market.earnings_events ee ${reviewedEarningsJoin}
       WHERE ee.security_id = $1
         AND (reviewed.id IS NOT NULL OR ee.reported_date IS NULL OR ee.reported_date <= CURRENT_DATE)
       ORDER BY ee.fiscal_year DESC, ee.fiscal_quarter DESC NULLS LAST LIMIT $2`, [securityId, limit]);
        return res.rows.reverse();
    },
    async upsertEarningsEvent(e) {
        await query(`INSERT INTO market.earnings_events (id, security_id, period_id, fiscal_year, fiscal_quarter, expected_date, reported_date, eps_estimate, eps_actual, revenue_estimate, revenue_actual)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET reported_date = EXCLUDED.reported_date, eps_actual = EXCLUDED.eps_actual, revenue_actual = EXCLUDED.revenue_actual`, [e.id, e.securityId, e.periodId ?? null, e.fiscalYear, e.fiscalQuarter ?? null, e.expectedDate ?? null,
            e.reportedDate ?? null, e.epsEstimate ?? null, e.epsActual ?? null, e.revenueEstimate ?? null, e.revenueActual ?? null]);
    },
    async upsertOwnership(records) {
        for (const r of records) {
            await query(`INSERT INTO market.ownership (security_id, holder_name, holder_type, shares_held, percent_held, as_of)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (security_id, holder_name) DO UPDATE SET
           shares_held = EXCLUDED.shares_held, percent_held = EXCLUDED.percent_held, as_of = EXCLUDED.as_of`, [r.securityId, r.holderName, r.holderType, r.sharesHeld, r.percentHeld, r.asOf]);
        }
    },
    async getOwnership(securityId) {
        const res = await query(`SELECT security_id as "securityId", holder_name as "holderName", holder_type as "holderType",
              shares_held as "sharesHeld", percent_held as "percentHeld", as_of as "asOf"
       FROM market.ownership WHERE security_id = $1 ORDER BY percent_held DESC`, [securityId]);
        return res.rows;
    },
};
