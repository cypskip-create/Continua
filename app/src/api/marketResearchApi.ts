import { continuaFetch } from "./client";
export interface ResearchRecord {
  id: string;
  kind: "ipo" | "macro" | "economic" | "bond" | "derivative" | "usp" | "market_statistics";
  title: string;
  symbol: string | null;
  observedAt: string;
  sourceUrl: string;
  payload: {
    status?: string;
    date?: string;
    price?: number;
    shares?: number;
    actual?: number;
    previous?: number;
    consensus?: number;
    unit?: string;
    importance?: number;
    tenor?: number;
    coupon?: number;
    maturity?: string;
    yield?: number;
    yieldBasis?: "accepted_auction" | "secondary_market";
    indicator?: string;
    isin?: string;
    expiry?: string;
    volume?: number;
    openInterest?: number;
    turnover?: number;
    change?: number;
  };
}
export interface MarketIntelligence {
  coverage: number;
  advancing: number;
  declining: number;
  unchanged: number;
  distribution: { label: string; count: number }[];
  sectors: {
    name: string;
    changePercent: number;
    coverage: number;
    symbols: string[];
  }[];
  monitor: {
    symbol: string;
    changePercent: number;
    volume: number | null;
    timestamp: string;
    signal: string;
  }[];
  methodology: string;
}
export interface MarketEarning {
  id: string;
  symbol: string;
  companyName: string;
  fiscalYear: number;
  fiscalQuarter: number | null;
  expectedDate: string | null;
  reportedDate: string | null;
  epsActual: number | null;
  epsEstimate: number | null;
  revenueActual: number | null;
  revenueEstimate: number | null;
}
export const marketResearchApi = {
  intelligence: () =>
    continuaFetch<MarketIntelligence>("/market-research/intelligence"),
  records: () =>
    continuaFetch<{ records: ResearchRecord[]; available: boolean }>(
      "/market-research/records",
    ),
  earnings: () => continuaFetch<MarketEarning[]>("/market-research/earnings"),
};
