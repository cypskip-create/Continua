import { computeRatios, yoyGrowth } from "./ratiosEngine.js";
import { computeAfriScore } from "./afriScore.js";
import { financialsRepository } from "../../storage/repositories/financialsRepository.js";
import { candlesRepository } from "../../storage/repositories/candlesRepository.js";
import { scoresRepository } from "../../storage/repositories/scoresRepository.js";
import { corporateActionsRepository } from "../../storage/repositories/corporateActionsRepository.js";
import { pricesRepository } from "../../storage/repositories/pricesRepository.js";
import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { logger } from "../../monitoring/logger.js";
import { trailingDividendPerShare } from "./dividendMetrics.js";
const pending = new Map();
export const researchService = {
    /** Recomputes ratios + AfriScore for a security from whatever's currently
     *  stored (latest financials, price history, dividends) and persists both.
     *  Called after fundamentals ingestion, and can be called on-demand by
     *  the API for a cache-miss. */
    async recomputeAndStore(securityId, currentPrice) {
        const key = `${securityId}:${currentPrice}`;
        const existing = pending.get(key);
        if (existing)
            return existing;
        const job = this.computeAndStore(securityId, currentPrice).finally(() => pending.delete(key));
        pending.set(key, job);
        return job;
    },
    async computeAndStore(securityId, currentPrice) {
        const to = new Date();
        const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
        const [newest, history, candles, dividends, sector, quote] = await Promise.all([
            financialsRepository.getLatestPeriodBundle(securityId, "annual"),
            financialsRepository.getHistoricalPeriods(securityId, "annual", 10),
            candlesRepository.getCandles(securityId, "1d", from.toISOString(), to.toISOString()),
            corporateActionsRepository.getDividendsBySecurity(securityId),
            securitiesRepository.getSectorName(securityId),
            pricesRepository.getQuote(securityId),
        ]);
        const eligible = [newest, ...history].filter(row => row && (!quote?.timestamp ||
            ((!row.periodEnd || row.periodEnd.slice(0,10) <= quote.timestamp.slice(0,10)) &&
             (!row.reportedAt || row.reportedAt.slice(0,10) <= quote.timestamp.slice(0,10)))) &&
            (!quote?.currency || !row.currency || quote.currency === row.currency));
        const latest = eligible.sort((a,b) => b.fiscalYear - a.fiscalYear)[0];
        if (quote?.source === 'mock')
            return null;
        if (!latest) {
            const asOf = quote?.timestamp ?? new Date().toISOString();
            const empty = await computeAfriScore(securityId, {ratios: {}, sector,
                basis: 'unavailable', calculatedAt: new Date().toISOString()});
            await scoresRepository.upsertResearchSnapshot({securityId, asOf}, {...empty, asOf});
            return null;
        }
        const prior = eligible.find(period => period.fiscalYear === latest.fiscalYear - 1 && (!latest.currency || !period.currency || latest.currency === period.currency)) ?? null;
        const datedCandles = candles.filter(c => !quote?.timestamp || Date.parse(c.timestamp) <= Date.parse(quote.timestamp));
        const priceHistory90d = datedCandles.length >= 40 && Date.parse(datedCandles.at(-1)?.timestamp) - Date.parse(datedCandles[0]?.timestamp) >= 75 * 86400000
            && !datedCandles.some((c,i) => i>0 && Date.parse(c.timestamp)-Date.parse(datedCandles[i-1].timestamp)>10*86400000) ? datedCandles.map(c => c.close) : [];
        const ttmDividend = trailingDividendPerShare(dividends, quote?.timestamp ? new Date(quote.timestamp) : to);
        const ratioInputs = {
            price: quote?.lastPrice ?? currentPrice,
            sharesOutstanding: latest.sharesOutstanding,
            netIncome: latest.netIncome,
            eps: latest.eps,
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
        const asOf = quote?.timestamp ?? new Date().toISOString();
        const ratios = { securityId, asOf, ...computedRatios };
        const revenueGrowthYoy = prior ? yoyGrowth(latest.revenue, prior.revenue) : undefined;
        const epsGrowthYoy = prior ? yoyGrowth(latest.eps, prior.eps) : undefined;
        const scoreResult = await computeAfriScore(securityId, { ratios: computedRatios, revenueGrowthYoy, epsGrowthYoy,
            sector, basis: latest.basis ?? 'reviewed_filing', fiscalYear: latest.fiscalYear,
            filingDateKnown: Boolean(latest.reportedAt), filingDate: latest.reportedAt ?? null, financialPeriodEnd: latest.periodEnd ?? null, priceAsOf: quote?.timestamp ?? null, sourceUrls: latest.sourceUrls ?? [], calculatedAt: new Date().toISOString() });
        const score = { ...scoreResult, asOf: quote?.timestamp ?? asOf };
        const published = await scoresRepository.upsertResearchSnapshot(ratios, score);
        if (published === false) return {ratios: await scoresRepository.getRatios(securityId), score: await scoresRepository.getAfriScore(securityId)};
        return { ratios, score };
    },
    async getRatios(securityId) {
        return scoresRepository.getRatios(securityId);
    },
    async getAfriScore(securityId) {
        return scoresRepository.getAfriScore(securityId);
    },
    /** Computes ratios + AfriScore for every security on an exchange. Run once
     *  at bootstrap (after the first price pass, so every symbol has a quote
     *  to compute against) so the screener and research endpoints are
     *  populated for the whole universe immediately — not just for whichever
     *  symbols happen to get queried first. */
    async recomputeAllForExchange(exchange) {
        const securities = await securitiesRepository.listForResearchRefresh(exchange);
        let computed = 0, skipped = 0, failed = 0;
        const deadline = Date.now() + 600000;
        for (const security of securities) {
          if (Date.now() >= deadline) break;
          try {
            const quote = await pricesRepository.getQuote(security.id);
            if (!quote) {
                skipped++;
                continue;
            }
            const result = await this.recomputeAndStore(security.id, quote.lastPrice);
            result ? computed++ : skipped++;
          } catch {failed++; logger.warn({securityId: security.id}, 'Research refresh failed; continuing independent issuers');}
        }
        const pending = securities.length - computed - skipped - failed;
        logger.info({ exchange, computed, skipped, failed, pending }, "Recomputed research for exchange");
        return { computed, skipped, failed, pending };
    },
};
