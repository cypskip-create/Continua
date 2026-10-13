import { moversService } from "../../services/marketData/moversService.js";
import { getQuery } from "../middleware/validateQuery.js";
export const moversController = {
    async getMovers(req, res) {
        const { exchange, limit } = getQuery(req);
        const movers = await moversService.getTopMovers(exchange, limit);
        res.json({ data: movers });
    },
};
