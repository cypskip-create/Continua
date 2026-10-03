import { query } from "../db.js";
import type { ComputedRatios, AfriScoreResult } from "../../types/market.js";

export const scoresRepository = {
  async upsertRatios(r: ComputedRatios): Promise<void> {
    await query(
      `INSERT INTO market.computed_ratios
         (security_id, as_of, pe, ps, pb, ev_ebitda, roe, roa, roic, gross_margin, operating_margin, net_margin,
          dividend_yield, payout_ratio, current_ratio, debt_to_equity, interest_coverage, price_momentum_3m, volatility_90d)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (security_id) DO UPDATE SET
         as_of=EXCLUDED.as_of, pe=EXCLUDED.pe, ps=EXCLUDED.ps, pb=EXCLUDED.pb, ev_ebitda=EXCLUDED.ev_ebitda, roe=EXCLUDED.roe,
         roa=EXCLUDED.roa, roic=EXCLUDED.roic, gross_margin=EXCLUDED.gross_margin, operating_margin=EXCLUDED.operating_margin,
         net_margin=EXCLUDED.net_margin, dividend_yield=EXCLUDED.dividend_yield, payout_ratio=EXCLUDED.payout_ratio,
         current_ratio=EXCLUDED.current_ratio, debt_to_equity=EXCLUDED.debt_to_equity, interest_coverage=EXCLUDED.interest_coverage,
         price_momentum_3m=EXCLUDED.price_momentum_3m, volatility_90d=EXCLUDED.volatility_90d`,
      [r.securityId, r.asOf, r.pe ?? null, r.ps ?? null, r.pb ?? null, r.evEbitda ?? null, r.roe ?? null, r.roa ?? null, r.roic ?? null,
       r.grossMargin ?? null, r.operatingMargin ?? null, r.netMargin ?? null, r.dividendYield ?? null, r.payoutRatio ?? null,
       r.currentRatio ?? null, r.debtToEquity ?? null, r.interestCoverage ?? null, r.priceMomentum3m ?? null, r.volatility90d ?? null]
    );
  },

  async getRatios(securityId: string): Promise<ComputedRatios | null> {
    const res = await query<any>(
      `SELECT security_id as "securityId", as_of as "asOf", pe, ps, pb, ev_ebitda as "evEbitda", roe, roa, roic,
              gross_margin as "grossMargin", operating_margin as "operatingMargin", net_margin as "netMargin",
              dividend_yield as "dividendYield", payout_ratio as "payoutRatio", current_ratio as "currentRatio",
              debt_to_equity as "debtToEquity", interest_coverage as "interestCoverage",
              price_momentum_3m as "priceMomentum3m", volatility_90d as "volatility90d"
       FROM market.computed_ratios WHERE security_id = $1`,
      [securityId]
    );
    return res.rows[0] ?? null;
  },

  async upsertAfriScore(s: AfriScoreResult): Promise<void> {
    await query(
      `INSERT INTO market.afri_scores
         (security_id, as_of, afri_score, afri_value, afri_growth, afri_health, afri_income, afri_risk, afri_quality, afri_momentum, inputs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (security_id) DO UPDATE SET
         as_of=EXCLUDED.as_of, afri_score=EXCLUDED.afri_score, afri_value=EXCLUDED.afri_value, afri_growth=EXCLUDED.afri_growth,
         afri_health=EXCLUDED.afri_health, afri_income=EXCLUDED.afri_income, afri_risk=EXCLUDED.afri_risk,
         afri_quality=EXCLUDED.afri_quality, afri_momentum=EXCLUDED.afri_momentum, inputs=EXCLUDED.inputs`,
      [s.securityId, s.asOf, s.afriScore, s.afriValue, s.afriGrowth, s.afriHealth, s.afriIncome, s.afriRisk,
       s.afriQuality, s.afriMomentum, JSON.stringify(s.inputs)]
    );
  },

  async getAfriScore(securityId: string): Promise<AfriScoreResult | null> {
    const res = await query<any>(
      `SELECT security_id as "securityId", as_of as "asOf", afri_score as "afriScore", afri_value as "afriValue",
              afri_growth as "afriGrowth", afri_health as "afriHealth", afri_income as "afriIncome",
              afri_risk as "afriRisk", afri_quality as "afriQuality", afri_momentum as "afriMomentum", inputs
       FROM market.afri_scores WHERE security_id = $1`,
      [securityId]
    );
    return res.rows[0] ?? null;
  },

  /** Average P/E and dividend yield across a security's sector, on the
   *  same exchange, excluding the security itself and any nulls/negative
   *  P/Es (a loss-making company's negative P/E would otherwise drag a
   *  sector "average" to a meaningless number) — used by
   *  services/technical/valuationService.ts's relative-valuation model. */
  async getSectorAverageRatios(exchange: string, sectorId: string, excludeSecurityId: string): Promise<{ avgPe: number | null; avgDividendYield: number | null; sampleSize: number }> {
    const res = await query<any>(
      `SELECT AVG(r.pe) FILTER (WHERE r.pe > 0) as "avgPe",
              AVG(r.dividend_yield) as "avgDividendYield",
              COUNT(*) FILTER (WHERE r.pe > 0) as "sampleSize"
       FROM market.computed_ratios r
       JOIN market.securities s ON s.id = r.security_id
       JOIN market.companies c ON c.id = s.company_id
       WHERE s.exchange = $1 AND c.sector_id = $2 AND s.id != $3`,
      [exchange, sectorId, excludeSecurityId]
    );
    const row = res.rows[0];
    return {
      avgPe: row?.avgPe != null ? Number(row.avgPe) : null,
      avgDividendYield: row?.avgDividendYield != null ? Number(row.avgDividendYield) : null,
      sampleSize: row?.sampleSize != null ? Number(row.sampleSize) : 0,
    };
  },
};
