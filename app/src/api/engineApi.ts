import { continuaFetch } from "./client";
import type { FinancialHistoryEntry, OwnershipRecord, Quote, StockEarningsEvent, ComputedRatios, AfriScoreResult } from "./types";
import type { ValuationResult } from "./valuationApi";

export interface EngineBundle {
  symbol: string; exchange: string; currency: string; companyName: string; generatedAt: string;
  quote: Quote | null; history: FinancialHistoryEntry[]; earnings: StockEarningsEvent[];
  ownership: OwnershipRecord[]; valuation: ValuationResult | null;
  ratios: ComputedRatios | null; score: AfriScoreResult | null;
  briefing: { title: string; methodology: string; facts: string[]; strengths: string[]; risks: string[]; coverage: string };
  estimates: StockEarningsEvent[];
  coverage: { annualPeriods: number; earningsEvents: number; shareholderDisclosures: number; valuationModels: number; analystEstimates: number; insiderTransactions: boolean; orderDepth: boolean; optionsData: boolean };
}
export const engineApi = {
  get(symbol: string, exchange: string) { return continuaFetch<EngineBundle>(`/engine/${encodeURIComponent(symbol)}`, { params: { exchange } }); },
};
