import type { FinancialHistoryEntry } from "../api/types";

export function financialNumber(value: unknown, currency = ""): string {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return "—";
  const n = Number(value), abs = Math.abs(n);
  const scale = abs >= 1e12 ? 1e12 : abs >= 1e9 ? 1e9 : abs >= 1e6 ? 1e6 : abs >= 1e3 ? 1e3 : 1;
  const unit = scale === 1e12 ? "T" : scale === 1e9 ? "B" : scale === 1e6 ? "M" : scale === 1e3 ? "K" : "";
  return `${currency ? currency + " " : ""}${(n / scale).toLocaleString("en", { maximumFractionDigits: 2 })}${unit}`;
}
export function finiteFinancial(value: unknown): number | null {
  return value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
}
export function growthPercent(value: unknown, prior: unknown): number | null {
  const n = finiteFinancial(value), p = finiteFinancial(prior);
  return n == null || p == null || p === 0 ? null : (n - p) / Math.abs(p) * 100;
}
export const financialPercent = (n: number | null) => n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
export const financialPeriod = (row: {fiscalYear: number; fiscalQuarter?: number | null}) => `${row.fiscalYear}/${row.fiscalQuarter ? `Q${row.fiscalQuarter}` : "FY"}`;
export type FinancialMetric = { label: string; get: (r: FinancialHistoryEntry) => unknown; kind?: "percent" | "ratio" | "perShare"; description?: string };
const ratio = (a: unknown, b: unknown, multiplier = 1) => {
  const n = finiteFinancial(a), d = finiteFinancial(b);
  return n == null || d == null || d <= 0 ? null : n / d * multiplier;
};
export const statementMetrics: Record<string, FinancialMetric[]> = {
  "Income statement": [
    {label:"Revenue",get:r=>r.revenue}, {label:"Cost of revenue",get:r=>r.costOfRevenue},
    {label:"Gross profit",get:r=>r.grossProfit}, {label:"Operating expenses",get:r=>r.operatingExpenses},
    {label:"Operating profit",get:r=>r.operatingIncome}, {label:"Net income",get:r=>r.netIncome},
    {label:"EBITDA",get:r=>r.ebitda}, {label:"EPS",get:r=>r.eps,kind:"perShare"},
  ],
  "Balance sheet": [
    {label:"Assets",get:r=>r.totalAssets}, {label:"Current assets",get:r=>r.currentAssets},
    {label:"Cash",get:r=>r.cash}, {label:"Liabilities",get:r=>r.totalLiabilities},
    {label:"Current liabilities",get:r=>r.currentLiabilities}, {label:"Equity",get:r=>r.totalEquity},
    {label:"Debt",get:r=>r.totalDebt}, {label:"Shares outstanding",get:r=>r.sharesOutstanding,kind:"ratio"},
  ],
  "Cash flows": [
    {label:"Operating cash flow",get:r=>r.operatingCashFlow}, {label:"Investing cash flow",get:r=>r.investingCashFlow},
    {label:"Financing cash flow",get:r=>r.financingCashFlow}, {label:"Free cash flow",get:r=>r.freeCashFlow},
    {label:"Capex",get:r=>r.capex},
  ],
  "Financial indicators": [
    {label:"EPS",get:r=>r.eps,kind:"perShare",description:"Reported earnings per share. Use comparable periods and share bases."},
    {label:"FCF",get:r=>r.freeCashFlow,description:"Reported free cash flow; not reconstructed when the filing omits it."},
    {label:"Current ratio",get:r=>ratio(r.currentAssets,r.currentLiabilities),kind:"ratio",description:"Current assets ÷ current liabilities. Not comparable across all sectors, especially banks."},
    {label:"Equity ratio",get:r=>ratio(r.totalEquity,r.totalAssets,100),kind:"percent",description:"Total equity ÷ total assets."},
    {label:"ROE",get:r=>ratio(r.netIncome,r.totalEquity,100),kind:"percent",description:"Period net income ÷ closing equity. Quarterly values are not annualised."},
    {label:"ROA",get:r=>ratio(r.netIncome,r.totalAssets,100),kind:"percent",description:"Period net income ÷ closing assets. Quarterly values are not annualised."},
    {label:"Gross margin",get:r=>ratio(r.grossProfit,r.revenue,100),kind:"percent",description:"Gross profit ÷ revenue; only available where both are reported."},
    {label:"Net margin",get:r=>ratio(r.netIncome,r.revenue,100),kind:"percent",description:"Net income ÷ revenue for the same reported period."},
  ],
};
export function metricNumber(value: unknown, metric: FinancialMetric): string {
  const n = finiteFinancial(value);
  return n == null ? "—" : metric.kind === "percent" ? `${n.toFixed(1)}%` : metric.kind === "perShare" ? n.toFixed(2) : financialNumber(n);
}
export function metricPoints(history: FinancialHistoryEntry[], metric: FinancialMetric) {
  return [...history].sort((a,b)=>a.fiscalYear-b.fiscalYear || (a.fiscalQuarter??0)-(b.fiscalQuarter??0)).map(row=>({
    period: financialPeriod(row), value: finiteFinancial(metric.get(row)),
    yoy: growthPercent(metric.get(row), (()=>{const prior=history.find(p=>p.fiscalYear===row.fiscalYear-1 && (p.fiscalQuarter??null)===(row.fiscalQuarter??null));return prior ? metric.get(prior) : null;})()),
    liabilities: finiteFinancial(row.totalLiabilities), ratio: ratio(row.totalLiabilities,row.totalAssets,100),
  }));
}
/** Shared thickness for all Fundamentals bar series, including grouped bars. */
export const FUNDAMENTAL_BAR_SIZE = 22;
