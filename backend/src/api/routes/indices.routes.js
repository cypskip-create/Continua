import { Router } from "express";
import { indexService } from "../../services/marketData/indexService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { getQuery } from "../middleware/validateQuery.js";
import { validateQuery } from "../middleware/validateQuery.js";
import { ExchangeQuery } from "../validators/querySchemas.js";
export const indicesController = {
    async list(req, res) {
        const { exchange } = getQuery(req);
        const indices = await indexService.getIndices(exchange);
        res.json({ data: indices });
    },
};
export const indicesRoutes = Router();
indicesRoutes.get("/indices", validateQuery(ExchangeQuery), asyncHandler(indicesController.list));
