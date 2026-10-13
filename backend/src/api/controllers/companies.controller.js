import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { ApiError } from "../middleware/errorHandler.js";
import { getQuery } from "../middleware/validateQuery.js";
export const companiesController = {
    async getProfile(req, res) {
        const { symbol } = req.params;
        const { exchange } = getQuery(req);
        const profile = await securitiesRepository.getCompanyProfile(exchange, symbol.toUpperCase());
        if (!profile)
            throw new ApiError(404, `No company found for ${symbol} on ${exchange}`);
        res.json({ data: profile });
    },
};
