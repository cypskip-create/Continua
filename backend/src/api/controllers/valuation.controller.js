import { valuationService } from "../../services/technical/valuationService.js";
import { ApiError } from "../middleware/errorHandler.js";
import { getQuery } from "../middleware/validateQuery.js";
import { valuationHistory } from '../../services/technical/valuationHistoryService.js';
export const valuationController = {
    async history(req, res) {
        const { exchange, ratio, years } = getQuery(req);
        res.json({ data: await valuationHistory(exchange, String(req.params.symbol).toUpperCase(), ratio, years) });
    },
    async get(req, res) {
        const { symbol } = req.params;
        const { exchange } = getQuery(req);
        const result = await valuationService.compute(exchange, symbol.toUpperCase());
        if (!result)
            throw new ApiError(404, `No quote or company data available for ${symbol} on ${exchange}`);
        res.json({ data: result });
    },
};
