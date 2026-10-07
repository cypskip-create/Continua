import type { Request, Response } from "express";
import { z } from "zod";
import { backtestService } from "../../services/technical/backtestService.js";
import { ApiError } from "../middleware/errorHandler.js";
import { ACTIVE_EXCHANGES } from "../../config/index.js";

const isoDateString = z.string().refine((v) => !Number.isNaN(Date.parse(v)));

const BacktestBodySchema = z.object({
  exchange: z.enum(ACTIVE_EXCHANGES).default("NSE"),
  symbol: z.string().min(1).max(20),
  strategy: z.enum(["sma_cross", "ema_cross", "rsi_reversion"]),
  from: isoDateString,
  to: isoDateString.optional(),
  feeBps: z.number().min(0).max(500).optional(),
  slippageBps: z.number().min(0).max(500).optional(),
  initialCapital: z.number().positive().max(1e9).optional(),
  maxVolumeParticipation: z.number().positive().max(0.2).optional(),
  fastPeriod: z.number().int().positive().max(500).optional(),
  slowPeriod: z.number().int().positive().max(500).optional(),
  rsiPeriod: z.number().int().positive().max(500).optional(),
  oversold: z.number().min(0).max(100).optional(),
  overbought: z.number().min(0).max(100).optional(),
});

export const backtestController = {
  async run(req: Request, res: Response) {
    const parsed = BacktestBodySchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, `Invalid backtest request: ${parsed.error.message}`);

    const body = parsed.data;
    const toIso = body.to ?? new Date().toISOString();

    const result = await backtestService.run({ ...body, symbol: body.symbol.toUpperCase(), to: toIso });
    if (!result) throw new ApiError(404, `Not enough candle history for ${body.symbol} on ${body.exchange} in that range`);
    res.json({ data: result });
  },
};