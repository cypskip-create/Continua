import { continuaFetch } from "./client";

export interface ValuationModel {
  model: string;
  fairValue: number | null;
  currentPrice: number;
  upsidePercent: number | null;
  inputs: Record<string, number | string | null>;
  methodology: string;
  unavailableReason?: string;
}

export interface ValuationResult {
  symbol: string;
  exchange: string;
  currentPrice: number;
  currency: string;
  models: ValuationModel[];
  caveat: string;
  priceAsOf?: string;
  rating?: {
    methodologyVersion: string; price: number|null; fair: number|null; low: number|null; high: number|null;
    spread: number|null; agreement: string; bands: number[]; upside: number|null; stars: number|null;
    models: ValuationModel[]; excluded: number; unavailableReason: string|null; priceAsOf: string|null;
    calculatedAt: string; methodology: string;
  };
}

export const valuationApi = {
  get(symbol: string, exchange = "NSE") {
    return continuaFetch<ValuationResult>(`/valuation/${encodeURIComponent(symbol)}`, { params: { exchange } });
  },
};
