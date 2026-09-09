import type { Request, Response } from "express";
import { z } from "zod";
import { historicalService } from "../../services/marketData/historicalService.js";
import { ApiError } from "../middleware/errorHandler.js";
import { getQuery } from "../middleware/validateQuery.js";
import type { HistoricalQuerySchema, PerformanceQuerySchema, SparklinesQuerySchema } from "../validators/querySchemas.js";

export const historicalController = {
  /** Batch recent-closes for list-view sparklines — one request for every
   *  row on a page instead of one request per row. Symbols with no candle
   *  history are simply absent from the response; the frontend renders
   *  that as an empty state, never a fabricated line. */
  async getSparklines(req: Request, res: Response) {
    const { exchange, symbols, points } = getQuery<z.infer<typeof SparklinesQuerySchema>>(req);
    const symbolList = symbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const data = await historicalService.getSparklines(exchange, symbolList, points);
    res.json({ data });
  },

  async getCandles(req: Request, res: Response) {
    const { symbol } = req.params;
    const { exchange, interval, from, to } = getQuery<z.infer<typeof HistoricalQuerySchema>>(req);
    const toIso = to ?? new Date().toISOString();
    const fromIso = from ?? new Date(Date.now() - 90 * 86_400_000).toISOString();
    const candles = await historicalService.getCandles(exchange, symbol!.toUpperCase(), interval, fromIso, toIso);
    res.json({ data: candles });
  },

  async getPerformance(req: Request, res: Response) {
    const { symbol } = req.params;
    const { exchange, from, to } = getQuery<z.infer<typeof PerformanceQuerySchema>>(req);
    const toIso = to ?? new Date().toISOString();
    const perf = await historicalService.getRangePerformance(exchange, symbol!.toUpperCase(), from, toIso);
    if (!perf) throw new ApiError(404, "No historical data available for that range");
    res.json({ data: perf });
  },
};