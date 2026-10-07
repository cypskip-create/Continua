import { continuaFetch } from "./client";

export type BacktestStrategy = "sma_cross" | "ema_cross" | "rsi_reversion";

export interface BacktestTrade {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  returnPercent: number;
  holdingDays: number;
}

export interface BacktestResult {
  symbol: string;
  exchange: string;
  strategy: BacktestStrategy;
  params: Record<string, number>;
  from: string;
  to: string;
  trades: BacktestTrade[];
  metrics: {
    totalTrades: number;
    winRate: number | null;
    totalReturnPercent: number;
    buyHoldReturnPercent: number;
    maxDrawdownPercent: number;
    averageHoldingDays: number | null;
  };
  caveat: string;
  execution?: {feeBps:number;slippageBps:number;skipped:number;openPosition:boolean};
  evaluation?: {inSampleReturn:number;outOfSampleReturn:number|null;splitDate:string|null};
}

export interface BacktestRequest {
  feeBps?:number;slippageBps?:number;initialCapital?:number;maxVolumeParticipation?:number;
  exchange?: string;
  symbol: string;
  strategy: BacktestStrategy;
  from: string;
  to?: string;
  fastPeriod?: number;
  slowPeriod?: number;
  rsiPeriod?: number;
  oversold?: number;
  overbought?: number;
}

export const backtestApi = {
  /** POST, not GET — a backtest request has a body (strategy + params),
   *  not query params. See api/client.ts's continuaFetch `method`/`body` support. */
  run(req: BacktestRequest) {
    return continuaFetch<BacktestResult>("/backtest", { method: "POST", body: { exchange: "NSE", ...req } });
  },
};