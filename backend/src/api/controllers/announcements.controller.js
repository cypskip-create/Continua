import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { companyAnnouncementsRepository } from "../../storage/repositories/companyAnnouncementsRepository.js";
import { ApiError } from "../middleware/errorHandler.js";
import { getQuery } from "../middleware/validateQuery.js";
export const announcementsController = {
    async getForSymbol(req, res) {
        const { symbol } = req.params;
        const { exchange, limit } = getQuery(req);
        const security = await securitiesRepository.getBySymbol(exchange, symbol.toUpperCase());
        if (!security)
            throw new ApiError(404, `Unknown symbol ${symbol}`);
        const announcements = await companyAnnouncementsRepository.listBySecurity(security.id, limit);
        res.json({ data: announcements });
    },
};
