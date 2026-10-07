/**
 * Multiple valuation models computed from real, already-ingested data
 * (financials, live quotes, stored ratios, dividend history) — nothing
 * estimated or looked up externally. Every model that can't produce a
 * number for a given security (e.g. no dividend history for a DDM, or
 * fewer than 3 sector peers for relative valuation) is OMITTED from the
 * response with a stated reason, not filled with a guess.
 *
 * These are standard, textbook formulas, not proprietary models — and
 * they're simplifications of real valuation practice (single-stage DDM
 * assumes constant growth forever; Graham Number assumes AAA-bond-yield
 * assumptions from 1970s America that don't map cleanly onto African
 * markets). The response says so. This is meant to be A starting point
 * for a user's own thinking, not a price target.
 */
import { financialsRepository } from "../../storage/repositories/financialsRepository.js";
import { scoresRepository } from "../../storage/repositories/scoresRepository.js";
import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { pricesRepository } from "../../storage/repositories/pricesRepository.js";
import { corporateActionsRepository } from "../../storage/repositories/corporateActionsRepository.js";
import { trailingDividendPerShare } from "../research/dividendMetrics.js";
import type { ExchangeCode } from "../../config/index.js";

export interface ValuationModel {
  model: string;
  fairValue: number | null;
  currentPrice: number;
  upsidePercent: number | null;
  inputs: Record<string, number | string | null>;
  methodology: string;
  /** Why fairValue is null, if it is — always present together with a
   *  null fairValue so the UI never has to guess why a model is missing. */
  unavailableReason?: string;
}

export interface ValuationResult {
  symbol: string;
  exchange: ExchangeCode;
  currentPrice: number;
  currency: string;
  models: ValuationModel[];
  caveat: string;
}

const CAVEAT =
  "Illustrative starting points, not price targets or investment advice. Each " +
  "model relies on simplifying assumptions (see each model's methodology) and " +
  "on the most recent annual financials on file, which may lag the current fiscal year.";

export const valuationService = {
  async compute(exchange: ExchangeCode, symbol: string): Promise<ValuationResult | null> {
    const securityId = `${exchange}:${symbol}`;
    const profile = await securitiesRepository.getCompanyProfile(exchange, symbol);
    if (!profile) return null;

    const quote = await pricesRepository.getQuote(securityId);
    if (!quote) return null;
    const currentPrice = quote.lastPrice;

    const [latestFinancials, ratios, dividends] = await Promise.all([
      financialsRepository.getLatestPeriodBundle(securityId, "annual"),
      scoresRepository.getRatios(securityId),
      corporateActionsRepository.getDividendsBySecurity(securityId),
    ]);

    const models: ValuationModel[] = [
      await relativeValuationModel(exchange, securityId, profile.company.sectorId, currentPrice, ratios),
      grahamNumberModel(currentPrice, latestFinancials),
      dividendDiscountModel(currentPrice, dividends),
    ];

    return { symbol, exchange, currentPrice, currency: quote.currency, models, caveat: CAVEAT };
  },
};

async function relativeValuationModel(
  exchange: ExchangeCode, securityId: string, sectorId: string | undefined, currentPrice: number, ratios: Awaited<ReturnType<typeof scoresRepository.getRatios>>
): Promise<ValuationModel> {
  const methodology = "Applies the sector's average P/E (excluding this security, and excluding loss-making peers) to this security's own trailing EPS.";

  if (!sectorId) return { model: "Relative Valuation (Sector P/E)", fairValue: null, currentPrice, upsidePercent: null, inputs: {}, methodology, unavailableReason: "No sector classification on file for this security." };
  if (!ratios?.pe || ratios.pe <= 0) return { model: "Relative Valuation (Sector P/E)", fairValue: null, currentPrice, upsidePercent: null, inputs: {}, methodology, unavailableReason: "No positive trailing P/E on file for this security (often means negative or unavailable EPS)." };

  const eps = currentPrice / ratios.pe;
  const sector = await scoresRepository.getSectorAverageRatios(exchange, sectorId, securityId);
  if (!sector.avgPe || sector.sampleSize < 3) {
    return { model: "Relative Valuation (Sector P/E)", fairValue: null, currentPrice, upsidePercent: null, inputs: { sectorPeerCount: sector.sampleSize }, methodology, unavailableReason: `Fewer than 3 profitable sector peers with computed ratios on file (found ${sector.sampleSize}) — not enough for a meaningful sector average.` };
  }

  const fairValue = round(sector.avgPe * eps);
  return {
    model: "Relative Valuation (Sector P/E)", fairValue, currentPrice,
    upsidePercent: round(((fairValue - currentPrice) / currentPrice) * 100),
    inputs: { trailingEps: round(eps), sectorAveragePe: round(sector.avgPe), sectorPeerCount: sector.sampleSize },
    methodology,
  };
}

function grahamNumberModel(currentPrice: number, financials: Awaited<ReturnType<typeof financialsRepository.getLatestPeriodBundle>>): ValuationModel {
  const methodology = "Benjamin Graham's formula: √(22.5 × EPS × Book Value per Share). Originally calibrated for defensive-investor screening in a different era/market; treat as a conservative floor estimate, not a target.";

  if (!financials) return { model: "Graham Number", fairValue: null, currentPrice, upsidePercent: null, inputs: {}, methodology, unavailableReason: "No fundamentals on file for this security yet." };

  const eps = financials.eps ?? (financials.sharesOutstanding ? financials.netIncome / financials.sharesOutstanding : null);
  const bookValuePerShare = financials.sharesOutstanding ? financials.totalEquity / financials.sharesOutstanding : null;

  if (eps == null || bookValuePerShare == null || eps <= 0 || bookValuePerShare <= 0) {
    return { model: "Graham Number", fairValue: null, currentPrice, upsidePercent: null, inputs: {}, methodology, unavailableReason: "Requires positive EPS, positive book value per share, and shares outstanding on file — at least one is missing or non-positive." };
  }

  const fairValue = round(Math.sqrt(22.5 * eps * bookValuePerShare));
  return {
    model: "Graham Number", fairValue, currentPrice,
    upsidePercent: round(((fairValue - currentPrice) / currentPrice) * 100),
    inputs: { eps: round(eps), bookValuePerShare: round(bookValuePerShare) },
    methodology,
  };
}

export function dividendDiscountModel(currentPrice: number, dividends: Awaited<ReturnType<typeof corporateActionsRepository.getDividendsBySecurity>>, now = new Date()): ValuationModel {
  const methodology = "Single-stage Gordon Growth Model: Fair Value = D₁ / (r − g), where D₁ is next year's expected dividend (TTM dividend grown by the historical growth rate), r is an assumed required return, and g is the historical dividend growth rate, capped well below r to keep the formula stable. Assumes constant growth forever, which real companies never actually deliver — treat this as illustrative for income-focused comparison, not a target.";
  const REQUIRED_RETURN = 0.12; // a generic equity-risk-premium-based assumption, not security-specific

  const payouts = dividends
    .filter((d): d is typeof d & { details: { type: "dividend" } } => d.details.type === "dividend")
    .sort((a, b) => new Date(b.exDate ?? b.announcedAt).getTime() - new Date(a.exDate ?? a.announcedAt).getTime());

  const priorEnd = new Date(now);
  priorEnd.setUTCFullYear(priorEnd.getUTCFullYear() - 1);
  const ttmDividend = trailingDividendPerShare(payouts, now);
  const priorTtmDividend = trailingDividendPerShare(payouts, priorEnd);
  if (ttmDividend == null || ttmDividend <= 0 || priorTtmDividend == null || priorTtmDividend <= 0 || currentPrice <= 0) {
    return { model: "Dividend Discount Model", fairValue: null, currentPrice, upsidePercent: null, inputs: {}, methodology, unavailableReason: "Requires positive recorded dividends in two consecutive twelve-month windows and a positive market price. Annual and semiannual payers are supported; growth is not invented." };
  }
  const growthRate = Math.max(-0.05, Math.min(0.08, (ttmDividend - priorTtmDividend) / priorTtmDividend));

  if (growthRate >= REQUIRED_RETURN) {
    return { model: "Dividend Discount Model", fairValue: null, currentPrice, upsidePercent: null, inputs: { ttmDividend: round(ttmDividend), growthRate: round(growthRate * 100) }, methodology, unavailableReason: "Estimated dividend growth rate meets or exceeds the assumed required return — the formula is undefined/unstable in this case." };
  }

  const nextYearDividend = ttmDividend * (1 + growthRate);
  const fairValue = round(nextYearDividend / (REQUIRED_RETURN - growthRate));

  return {
    model: "Dividend Discount Model", fairValue, currentPrice,
    upsidePercent: round(((fairValue - currentPrice) / currentPrice) * 100),
    inputs: { ttmDividend: round(ttmDividend), estimatedGrowthRatePercent: round(growthRate * 100), assumedRequiredReturnPercent: round(REQUIRED_RETURN * 100) },
    methodology,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
