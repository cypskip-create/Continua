import { Router } from "express";
import { z } from "zod";
import { requireSubscriber } from "../middleware/requireSubscriber.js";
import { asyncHandler, ApiError } from "../middleware/errorHandler.js";
import { validateQuery, getQuery } from "../middleware/validateQuery.js";
import { ExchangeQuery } from "../validators/querySchemas.js";
import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { pricesRepository } from "../../storage/repositories/pricesRepository.js";
import { financialsRepository } from "../../storage/repositories/financialsRepository.js";
import { corporateActionsRepository } from "../../storage/repositories/corporateActionsRepository.js";
import { researchService } from "../../services/research/researchService.js";
import { valuationService } from "../../services/technical/valuationService.js";
import { buildCompanyBriefing } from "../../services/research/engineBriefing.js";
import { cache } from "../../storage/cache.js";

export const engineRoutes = Router();
engineRoutes.get("/engine/:symbol", requireSubscriber, validateQuery(ExchangeQuery), asyncHandler(async (req, res) => {
  const { exchange } = getQuery<z.infer<typeof ExchangeQuery>>(req);
  const symbol = String(req.params.symbol).toUpperCase();
  if (!/^[A-Z0-9.\-]{1,20}$/.test(symbol)) throw new ApiError(400, "Invalid stock symbol");
  // Entitlement is checked for every request, before consulting the shared
  // market-data cache. No subscriber output can be fetched with just an API key.
  const data = await cache.getOrSet(`engine:v1:${exchange}:${symbol}`, 60_000, async () => {
    const profile = await securitiesRepository.getCompanyProfile(exchange, symbol);
    if (!profile) throw new ApiError(404, "This stock is not covered yet");
    const [quote, history, earnings, ownership, valuation, ratios, score] = await Promise.all([
      pricesRepository.getQuote(profile.id),
      financialsRepository.getHistoricalPeriods(profile.id, "annual", 10),
      corporateActionsRepository.getEarningsBySecurity(profile.id),
      corporateActionsRepository.getOwnership(profile.id),
      valuationService.compute(exchange, symbol),
      researchService.getRatios(profile.id),
      researchService.getAfriScore(profile.id),
    ]);
    const sorted = [...history].sort((a, b) => a.fiscalYear - b.fiscalYear);
    const latest = sorted.at(-1), prior = sorted.at(-2);
    return {
      symbol, exchange, currency: profile.currency, companyName: profile.company.name,
      generatedAt: new Date().toISOString(), quote, history: sorted, earnings, ownership, valuation, ratios, score,
      briefing: buildCompanyBriefing({ symbol, latest, prior, ratios }),
      estimates: earnings.filter(event => event.epsEstimate != null || event.revenueEstimate != null),
      coverage: {
        annualPeriods: sorted.length, earningsEvents: earnings.length, shareholderDisclosures: ownership.length,
        valuationModels: valuation?.models.filter(model => model.fairValue != null).length ?? 0,
        analystEstimates: earnings.filter(event => event.epsEstimate != null || event.revenueEstimate != null).length,
        insiderTransactions: false, orderDepth: false, optionsData: false,
      },
    };
  });
  res.json({ data });
}));
