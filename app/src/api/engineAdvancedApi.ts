import { continuaFetch } from "./client";
export interface PrivateForecast {
  id: string;
  symbol: string;
  question: string;
  rules: string;
  deadline: string;
  probability: number;
  revisions: { at: string; probability: number; rationale: string }[];
  status: "open" | "resolved" | "void";
  outcome: boolean | null;
  resolution_source: string | null;
  resolution_note: string | null;
}
export interface Notebook {
  forecasts: PrivateForecast[];
  calibration: {
    resolvedCount: number;
    initialBrier: number | null;
    latestBrier: number | null;
    bins: {
      range: string;
      count: number;
      meanProbability: number | null;
      observedYesRate: number | null;
    }[];
    methodology: string;
    warning: string | null;
  };
}
export interface AdvancedResult {
  kind: string;
  methodology: string;
  inputVerification: string;
  curve?: {
    date: string;
    index: number;
    benchmark?: number;
    band?: number[];
  }[];
  [key: string]: unknown;
}
export const engineAdvancedApi = {
  history: (symbol: string, start: string, end: string) =>
    continuaFetch<{
      symbol: string;
      points: { date: string; close: number }[];
      observations?: {date:string;close:number;sourceUrl:string;currency:string|null}[];
      currency?:string|null;
      sourceUrls: string[];
      basis: string;
    }>("/engine/labs/history-inputs", { params: { symbol, start, end } }),
  pipeline: () =>
    continuaFetch<{
      checkedAt: string;
      status: string;
      checks: { name: string; ok: boolean }[];
      validations: { outcome: string; count: number; latest: string }[];
      limits: string[];
      methodology: string;
    }>("/engine/pipeline-health"),
  calculate: (body: unknown) =>
    continuaFetch<AdvancedResult>("/engine/labs/advanced", {
      method: "POST",
      body,
    }),
  notebook: () => continuaFetch<Notebook>("/engine/notebook"),
  create: (body: {
    symbol: string;
    question: string;
    rules: string;
    deadline: string;
    probability: number;
    rationale: string;
  }) =>
    continuaFetch<PrivateForecast>("/engine/notebook", {
      method: "POST",
      body,
    }),
  revise: (id: string, probability: number, rationale: string) =>
    continuaFetch<PrivateForecast>(
      `/engine/notebook/${encodeURIComponent(id)}/revise`,
      { method: "POST", body: { probability, rationale } },
    ),
  resolve: (
    id: string,
    outcome: "yes" | "no" | "void",
    sourceUrl: string,
    note: string,
  ) =>
    continuaFetch<PrivateForecast>(
      `/engine/notebook/${encodeURIComponent(id)}/resolve`,
      { method: "POST", body: { outcome, sourceUrl, note } },
    ),
  recommendations: () =>
    continuaFetch<{
      tools: string[];
      companies: { symbol: string; exchange: string; reason: string }[];
      reason: string;
      methodology: string;
    }>("/engine/recommendations"),
  versions: (symbol: string) =>
    continuaFetch<{
      versions: {
        id: string;
        table_name: string;
        period_id: string;
        operation: string;
        recorded_at: string;
        before_payload: unknown;
        after_payload: unknown;
      }[];
      methodology: string;
    }>("/engine/financial-versions", { params: { symbol } }),
};
