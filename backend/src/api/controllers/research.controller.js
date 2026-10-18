import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { pricesRepository } from "../../storage/repositories/pricesRepository.js";
import { researchService } from "../../services/research/researchService.js";
import { cache, CacheKeys } from "../../storage/cache.js";
import { ApiError } from "../middleware/errorHandler.js";
import { getQuery } from "../middleware/validateQuery.js";
export const researchController = {
    async getResearch(req, res) {
        const { symbol } = req.params;
        const { exchange } = getQuery(req);
        const upperSymbol = symbol.toUpperCase();
        const security = await securitiesRepository.getBySymbol(exchange, upperSymbol);
        if (!security)
            throw new ApiError(404, `Unknown symbol ${symbol}`);
        let [ratios, score] = await Promise.all([
            cache.getOrSet(CacheKeys.ratios(exchange, upperSymbol), 60_000, () => researchService.getRatios(security.id)),
            cache.getOrSet(CacheKeys.afriScore(exchange, upperSymbol), 60_000, () => researchService.getAfriScore(security.id)),
        ]);
        if (score?.inputs?.methodologyVersion !== 'continua-c-score-v2') score = null;
        const quote = await pricesRepository.getQuote(security.id);
        const computedAt = Date.parse(String(score?.inputs?.calculatedAt ?? ''));
        if (!quote) score = null;
        if (!ratios || !score || !Number.isFinite(computedAt) || Date.now() - computedAt > 60000 || score.asOf !== quote?.timestamp) {
            if (quote) {
                const recomputed = await researchService.recomputeAndStore(security.id, quote.lastPrice);
                if (recomputed) {
                    ratios = recomputed.ratios;
                    score = recomputed.score;
                    await Promise.all([
                        cache.set(CacheKeys.ratios(exchange, upperSymbol), ratios, 60_000),
                        cache.set(CacheKeys.afriScore(exchange, upperSymbol), score, 60_000),
                    ]);
                } else {ratios = null; score = null;}
            }
        }
        if (!ratios || !score)
            return res.json({data: {ratios: ratios ?? {securityId: security.id, asOf: null}, score: null, status: 'insufficient_evidence', reason: 'Comparable financial evidence is not available yet. No score is fabricated.'}});
        res.json({ data: { ratios, score } });
    },
};
