import { indicatorsService } from "../../services/technical/indicatorsService.js";
import { ApiError } from "../middleware/errorHandler.js";
import { getQuery } from "../middleware/validateQuery.js";
export const indicatorsController = {
    async get(req, res) {
        const { symbol } = req.params;
        const { exchange, type, period, fast, slow, signal, from, to } = getQuery(req);
        const toIso = to ?? new Date().toISOString();
        // Default lookback scales with the slowest period requested, so e.g.
        // a 200-day SMA actually has 200 days of history to compute from
        // rather than silently returning mostly-null values.
        const longestPeriod = Math.max(period ?? 0, slow ?? 0, 50);
        const fromIso = from ?? new Date(Date.now() - (longestPeriod + 30) * 86_400_000).toISOString();
        const result = await indicatorsService.compute({ exchange, symbol: symbol.toUpperCase(), type, period, fast, slow, signal, from: fromIso, to: toIso });
        if (!result)
            throw new ApiError(404, `No candle data available for ${symbol} on ${exchange} in that range`);
        res.json({ data: result });
    },
};
