import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { cache, CacheKeys } from "../../storage/cache.js";
import { getQuery } from "../middleware/validateQuery.js";
/** Lists the full tradable-instrument universe for an exchange. Exists so a
 *  frontend can build its symbol list (watchlist pickers, "all stocks"
 *  pages, screener sector filters) from the Data Layer instead of a
 *  hand-maintained local array that silently drifts out of sync with what
 *  the backend actually has data for. */
export const instrumentsController = {
    async list(req, res) {
        const { exchange } = getQuery(req);
        const instruments = await cache.getOrSet(CacheKeys.instruments(exchange), 300_000, () => securitiesRepository.listInstruments(exchange));
        res.json({ data: instruments });
    },
};
