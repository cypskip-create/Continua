import type { Request, Response } from "express";
import { z } from "zod";
import { valuationService } from "../../services/technical/valuationService.js";
import { ApiError } from "../middleware/errorHandler.js";
import { getQuery } from "../middleware/validateQuery.js";
import type { ExchangeQuery } from "../validators/querySchemas.js";
import {valuationHistory} from '../../services/technical/valuationHistoryService.js';
import type {ExchangeCode} from '../../config/index.js';

export const valuationController = {
  async history(req:Request,res:Response) {
    const {exchange,ratio,years}=getQuery<{exchange:ExchangeCode;ratio:'pe'|'pb'|'ps';years:number}>(req);
    res.json({data:await valuationHistory(exchange,String(req.params.symbol).toUpperCase(),ratio,years)});
  },
  async get(req: Request, res: Response) {
    const { symbol } = req.params;
    const { exchange } = getQuery<z.infer<typeof ExchangeQuery>>(req);
    const result = await valuationService.compute(exchange, symbol!.toUpperCase());
    if (!result) throw new ApiError(404, `No quote or company data available for ${symbol} on ${exchange}`);
    res.json({ data: result });
  },
};
