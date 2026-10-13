import { quoteService } from "../../services/marketData/quoteService.js";
import { ApiError } from "../middleware/errorHandler.js";
import { getQuery } from "../middleware/validateQuery.js";
export const quotesController = {
    async getOne(req, res) {
        const { symbol } = req.params;
        const { exchange } = getQuery(req);
        const quote = await quoteService.getQuote(exchange, symbol.toUpperCase());
        if (!quote)
            throw new ApiError(404, `No quote found for ${symbol} on ${exchange}`);
        res.json({ data: quote });
    },
    async getBatch(req, res) {
        const { exchange, symbols: symbolsParam } = getQuery(req);
        const symbols = symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
        const quotes = await quoteService.getQuotesBatch(exchange, symbols);
        res.json({ data: quotes });
    },
};
