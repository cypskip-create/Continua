import { screeningService } from "../../services/screening/screeningService.js";
import { getQuery } from "../middleware/validateQuery.js";
export const screenerController = {
    async run(req, res) {
        const q = getQuery(req);
        const filters = {
            exchange: q.exchange,
            sector: q.sector,
            minMarketCap: q.minMarketCap,
            maxPe: q.maxPe,
            minDividendYield: q.minDividendYield,
            minAfriScore: q.minAfriScore,
            sortBy: q.sortBy,
            sortDirection: q.sortDirection,
            limit: q.limit,
        };
        const results = await screeningService.screen(filters);
        res.json({ data: results });
    },
};
