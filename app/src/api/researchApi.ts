import { continuaFetch } from "./client";
import type { ResearchBundle } from "./types";

export const researchApi = {
  batch(symbols:string[],exchange='NSE'){return continuaFetch<{items:Record<string,ResearchBundle|null>;unavailable:string[]}>('/research/batch',{params:{symbols:symbols.join(','),exchange}});},
  get(symbol: string, exchange = "NSE") {
    return continuaFetch<ResearchBundle>(`/research/${encodeURIComponent(symbol)}`, { params: { exchange } });
  },
};