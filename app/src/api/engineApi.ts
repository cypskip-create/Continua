import { continuaFetch } from "./client";
import type { FinancialHistoryEntry, OwnershipRecord, Quote, StockEarningsEvent, ComputedRatios, AfriScoreResult } from "./types";
import type { ValuationResult } from "./valuationApi";

export interface EngineBundle {
  symbol: string; exchange: string; currency: string; companyName: string; generatedAt: string;
  quote: Quote | null; history: FinancialHistoryEntry[]; earnings: StockEarningsEvent[];
  ownership: OwnershipRecord[]; valuation: ValuationResult | null;
  ratios: ComputedRatios | null; score: AfriScoreResult | null;
  briefing: { title: string; methodology: string; facts: string[]; strengths: string[]; risks: string[]; coverage: string };
  synthesis: { observations: { topic: string; text: string; asOf: string | null }[]; checklist: { topic: string; text: string; asOf: string | null }[]; methodology: string };
  unavailable: string[];
  news: { id: string; headline: string; summary: string; methodology: string; fullTextAvailable: boolean; source: string; url: string; publishedAt: string | null; impact?: { topic: string; reason: string } | null }[];
  technicals: { type: string; timestamps: string[]; latest: number | { macd: number | null; signal: number | null; histogram: number | null } | null }[];
  quality?: {quoteAsOf:string|null;quoteSource:string|null;periodEnd:string|null;filedAt:string|null;warnings:string[];priceAdjustmentBasis:string};
  financialAnalysis?: {period:number|null;metrics:Record<string,number|null>;findings:string[];sectorNote:string;missing:string[]};
  changes?: {baseline:boolean;fingerprint:string;comparedAsOf:string|null;changes:{topic:string;text:string;material:boolean}[]};
  dividendAnalysis?: {trailingDps:number|null;payoutRatio:number|null;coverage:number|null};
  scenarios?: {name:string;growthPercent:number;revenue:number|null;netIncome:number|null;assumption:string}[];
  estimates: StockEarningsEvent[];
  coverage: { annualPeriods: number; earningsEvents: number; shareholderDisclosures: number; valuationModels: number; analystEstimates: number; insiderTransactions: boolean; orderDepth: boolean; optionsData: boolean };
}
export const engineApi = {
  researchAccess(symbol: string, exchange: string) { return continuaFetch<{allowed:boolean}>(`/engine/research-access/${encodeURIComponent(symbol)}`, {params:{exchange}}); },
  get(symbol: string, exchange: string) { return continuaFetch<EngineBundle>(`/engine/${encodeURIComponent(symbol)}`, { params: { exchange } }); },
};
