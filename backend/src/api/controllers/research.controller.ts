import type { Request, Response } from "express";
import { z } from "zod";
import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { pricesRepository } from "../../storage/repositories/pricesRepository.js";
import { researchService } from "../../services/research/researchService.js";
import { cache, CacheKeys } from "../../storage/cache.js";
import { ApiError } from "../middleware/errorHandler.js";
import { getQuery } from "../middleware/validateQuery.js";
import type { ExchangeQuery } from "../validators/querySchemas.js";

export const researchController = {
  async getResearch(req: Request, res: Response) {
    const { symbol } = req.params;
    const { exchange } = getQuery<z.infer<typeof ExchangeQuery>>(req);
    const upperSymbol = symbol!.toUpperCase();
    const security = await securitiesRepository.getBySymbol(exchange, upperSymbol);
    if (!security) throw new ApiError(404, `Unknown symbol ${symbol}`);

    let [ratios, score] = await Promise.all([
      cache.getOrSet(CacheKeys.ratios(exchange, upperSymbol), 60_000, () => researchService.getRatios(security.id)),
      cache.getOrSet(CacheKeys.afriScore(exchange, upperSymbol), 60_000, () => researchService.getAfriScore(security.id)),
    ]);

    if (!ratios || !score) {
      const quote = await pricesRepository.getQuote(security.id);
      if (quote) {
        const recomputed = await researchService.recomputeAndStore(security.id, quote.lastPrice);
        if (recomputed) {
          ratios = recomputed.ratios; score = recomputed.score;
          await Promise.all([
            cache.set(CacheKeys.ratios(exchange, upperSymbol), ratios, 60_000),
            cache.set(CacheKeys.afriScore(exchange, upperSymbol), score, 60_000),
          ]);
        }
      }
    }

    if (!ratios || !score) throw new ApiError(404, "Research data not available yet for this symbol");
    res.json({ data: { ratios, score } });
  },
};
