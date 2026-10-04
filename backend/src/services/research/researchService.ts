import { computeRatios, yoyGrowth } from "./ratiosEngine.js";
import { computeAfriScore } from "./afriScore.js";
import { financialsRepository } from "../../storage/repositories/financialsRepository.js";
import { candlesRepository } from "../../storage/repositories/candlesRepository.js";
import { scoresRepository } from "../../storage/repositories/scoresRepository.js";
import { corporateActionsRepository } from "../../storage/repositories/corporateActionsRepository.js";
import { pricesRepository } from "../../storage/repositories/pricesRepository.js";
import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import type { ComputedRatios, AfriScoreResult } from "../../types/market.js";
import { logger } from "../../monitoring/logger.js";
import { trailingDividendPerShare } from "./dividendMetrics.js";

type ResearchResult = { ratios: ComputedRatios; score: AfriScoreResult } | null;
const pending = new Map<string, Promise<ResearchResult>>();

export const researchService = {
  /** Recomputes ratios + AfriScore for a security from whatever's currently
   *  stored (latest financials, price history, dividends) and persists both.
   *  Called after fundamentals ingestion, and can be called on-demand by
   *  the API for a cache-miss. */
  async recomputeAndStore(securityId: string, currentPrice: number): Promise<{ ratios: ComputedRatios; score: AfriScoreResult } | null> {
    const key = `${securityId}:${currentPrice}`;
    const existing = pending.get(key);
    if (existing) return existing;
    const job = this.computeAndStore(securityId, currentPrice).finally(() => pending.delete(key));
    pending.set(key, job);
    return job;
  },

  async computeAndStore(securityId: string, currentPrice: number): Promise<ResearchResult> {
    const to = new Date();
    const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
    const [latest, history, candles, dividends] = await Promise.all([
      financialsRepository.getLatestPeriodBundle(securityId, "annual"),
      financialsRepository.getHistoricalPeriods(securityId, "annual", 2),
      candlesRepository.getCandles(securityId, "1d", from.toISOString(), to.toISOString()),
      corporateActionsRepository.getDividendsBySecurity(securityId),
    ]);
    if (!latest) return null;
    const prior = history.length >= 2 ? history[0] : null;
    const priceHistory90d = candles.map(c => c.close);
    const ttmDividend = trailingDividendPerShare(dividends, to);

    const ratioInputs = {
      price: currentPrice,
      sharesOutstanding: latest.sharesOutstanding,
      netIncome: latest.netIncome,
      revenue: latest.revenue,
      ebitda: latest.ebitda,
      operatingIncome: latest.operatingIncome,
      grossProfit: latest.grossProfit,
      totalEquity: latest.totalEquity,
      totalAssets: latest.totalAssets,
      totalDebt: latest.totalDebt,
      cash: latest.cash,
      currentAssets: latest.currentAssets,
      currentLiabilities: latest.currentLiabilities,
      dividendPerShareTtm: ttmDividend,
      priceHistory90d: priceHistory90d.length ? priceHistory90d : undefined,
    };

    const computedRatios = computeRatios(ratioInputs);
    const asOf = new Date().toISOString();
    const ratios: ComputedRatios = { securityId, asOf, ...computedRatios };
    await scoresRepository.upsertRatios(ratios);

    const revenueGrowthYoy = prior ? yoyGrowth(latest.revenue, prior.revenue) : undefined;
    const epsGrowthYoy = prior ? yoyGrowth(latest.eps, prior.eps) : undefined;

    const scoreResult = computeAfriScore(securityId, { ratios: computedRatios, revenueGrowthYoy, epsGrowthYoy });
    const score: AfriScoreResult = { ...scoreResult, asOf };
    await scoresRepository.upsertAfriScore(score);

    return { ratios, score };
  },

  async getRatios(securityId: string): Promise<ComputedRatios | null> {
    return scoresRepository.getRatios(securityId);
  },

  async getAfriScore(securityId: string): Promise<AfriScoreResult | null> {
    return scoresRepository.getAfriScore(securityId);
  },

  /** Computes ratios + AfriScore for every security on an exchange. Run once
   *  at bootstrap (after the first price pass, so every symbol has a quote
   *  to compute against) so the screener and research endpoints are
   *  populated for the whole universe immediately — not just for whichever
   *  symbols happen to get queried first. */
  async recomputeAllForExchange(exchange: string): Promise<{ computed: number; skipped: number }> {
    const securities = await securitiesRepository.listByExchange(exchange);
    let computed = 0, skipped = 0;
    for (const security of securities) {
      const quote = await pricesRepository.getQuote(security.id);
      if (!quote) { skipped++; continue; }
      const result = await this.recomputeAndStore(security.id, quote.lastPrice);
      result ? computed++ : skipped++;
    }
    logger.info({ exchange, computed, skipped }, "Recomputed research for exchange");
    return { computed, skipped };
  },
};
