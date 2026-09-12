import type { Request, Response } from "express";
import type { z } from "zod";
import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { newsRepository } from "../../storage/repositories/newsRepository.js";
import { ApiError } from "../middleware/errorHandler.js";
import { getQuery } from "../middleware/validateQuery.js";
import type { NewsQuerySchema, SecurityNewsQuerySchema } from "../validators/querySchemas.js";

export const newsController = {
  /** GET /api/v1/news — the Media/TradersHub feed: everything recent, optionally filtered by category. */
  async listRecent(req: Request, res: Response) {
    const { category, limit } = getQuery<z.infer<typeof NewsQuerySchema>>(req);
    const items = await newsRepository.listRecent(limit, category);
    res.json({ data: items });
  },

  /** GET /api/v1/news/:symbol — news mentioning one specific security, for the stock research page. */
  async getForSymbol(req: Request, res: Response) {
    const { symbol } = req.params;
    const { exchange, limit } = getQuery<z.infer<typeof SecurityNewsQuerySchema>>(req);
    const security = await securitiesRepository.getBySymbol(exchange, symbol!.toUpperCase());
    if (!security) throw new ApiError(404, `Unknown symbol ${symbol}`);
    const items = await newsRepository.listBySecurity(security.id, limit);
    res.json({ data: items });
  },
};