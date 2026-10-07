import { Router } from "express";
import { backtestController } from "../controllers/backtest.controller.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireSubscriber } from "../middleware/requireSubscriber.js";

export const backtestRoutes = Router();
// POST, not GET: a backtest is a computation request with a body (strategy
// params), not a resource fetch — matches how /screener's more complex
// filter shape is handled elsewhere in this API where relevant.
backtestRoutes.post("/backtest", requireSubscriber, asyncHandler(backtestController.run));
