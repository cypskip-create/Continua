import { createHash } from "node:crypto";

export interface FinancialRow {
  fiscalYear: number; fiscalQuarter?: number | null; periodEnd?: string; reportedAt?: string; currency?: string;
  revenue?: number | null; netIncome?: number | null; eps?: number | null;
  totalAssets?: number | null; totalLiabilities?: number | null; totalEquity?: number | null;
  operatingCashFlow?: number | null; freeCashFlow?: number | null; totalDebt?: number | null;
  currentAssets?: number | null; currentLiabilities?: number | null; sharesOutstanding?: number | null;
}
export const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const divide = (a: unknown, b: unknown) => finite(a) && finite(b) && b > 0 ? a / b : null;
export function analyzeFinancials(rows: FinancialRow[], sector: string) {
  const sorted = [...rows].sort((a,b) => a.fiscalYear - b.fiscalYear);
  const latest = sorted[sorted.length-1], previous = sorted[sorted.length-2];
  const consecutive = latest && previous && latest.fiscalYear === previous.fiscalYear + 1;
  const growth = (field: "revenue" | "netIncome" | "sharesOutstanding") => consecutive && finite(latest[field]) && finite(previous[field]) && previous[field] !== 0 ? (latest[field]! - previous[field]!) / Math.abs(previous[field]!) * 100 : null;
  const metrics = {
    revenueGrowth: growth("revenue"), earningsGrowth: growth("netIncome"), dilution: growth("sharesOutstanding"),
    cashConversion: divide(latest?.operatingCashFlow, latest?.netIncome),
    freeCashFlowMargin: divide(latest?.freeCashFlow, latest?.revenue),
    debtToEquity: divide(latest?.totalDebt, latest?.totalEquity),
    currentRatio: divide(latest?.currentAssets, latest?.currentLiabilities),
    returnOnAssets: divide(latest?.netIncome, latest?.totalAssets),
  };
  const findings: string[] = [];
  if (metrics.cashConversion != null && metrics.cashConversion < 1) findings.push("Operating cash flow is below reported profit; inspect accruals and working-capital changes.");
  if (finite(latest?.freeCashFlow) && latest.freeCashFlow < 0) findings.push("Free cash flow is negative in the latest reported annual period.");
  if (metrics.dilution != null && metrics.dilution > 2) findings.push(`Reported share count increased ${metrics.dilution.toFixed(1)}%; inspect dilution and any share splits before attributing the change.`);
  if (finite(latest?.totalEquity) && latest.totalEquity <= 0) findings.push("Reported equity is non-positive; equity-based valuation and leverage ratios are not interpretable normally.");
  return { period: latest?.fiscalYear ?? null, metrics, findings,
    sectorNote: /bank|insurance|financial/i.test(sector) ? "Financial institutions require regulatory capital, loan quality and interest-margin disclosures. Generic industrial debt/current-ratio thresholds are not a suitability score." : "Cash conversion, liquidity, dilution and leverage should be assessed together with sector peers.",
    missing: ["Debt maturity schedule", "Audited segment/geographic breakdown", "Management guidance"],
  };
}
export function dataQuality(quote: { timestamp?: string; source?: string } | null, rows: FinancialRow[], now = new Date()) {
  const latest = [...rows].sort((a,b)=>b.fiscalYear-a.fiscalYear)[0];
  const age = (stamp?: string) => stamp && Number.isFinite(Date.parse(stamp)) ? Math.floor((now.getTime()-Date.parse(stamp))/86400000) : null;
  const warnings: string[] = [];
  const quoteAge = age(quote?.timestamp), filingAge = age(latest?.periodEnd);
  if (quoteAge != null && quoteAge > 7) warnings.push("Quote is more than seven calendar days old; check the exchange calendar and feed status.");
  if (filingAge != null && filingAge > 550) warnings.push("Latest annual reporting period is more than 18 months old.");
  if (!latest) warnings.push("Annual financial coverage is missing.");
  for (const row of rows) {
    if (finite(row.totalAssets) && finite(row.totalLiabilities) && finite(row.totalEquity) && Math.abs(row.totalAssets-row.totalLiabilities-row.totalEquity) > Math.max(1,Math.abs(row.totalAssets)*0.02)) warnings.push(`FY${row.fiscalYear}: assets do not reconcile to liabilities plus equity within 2%.`);
    if (age(row.reportedAt) != null && age(row.reportedAt)! < 0) warnings.push(`FY${row.fiscalYear}: filing date is in the future.`);
  }
  const periods = rows.map(r=>`${r.fiscalYear}:${r.fiscalQuarter ?? "annual"}`);
  if(new Set(periods).size !== periods.length) warnings.push("Duplicate reporting periods require reconciliation.");
  return { quoteAsOf: quote?.timestamp ?? null, quoteSource: quote?.source ?? null, periodEnd: latest?.periodEnd ?? null, filedAt: latest?.reportedAt ?? null, warnings:[...new Set(warnings)], priceAdjustmentBasis:"Unverified provider basis; corporate-action periods require verification before return analysis." };
}
export interface ResearchState { fiscalYear: number | null; revenue: number | null; netIncome: number | null; debtToEquity: number | null; fairValue: number | null; newsIds: string[]; ownership: {name:string;percent:number}[] }
export function fingerprint(state: ResearchState) { return createHash("sha256").update(JSON.stringify(state)).digest("hex"); }
export function changesBetween(previous: ResearchState | null, current: ResearchState) {
  if (!previous) return { baseline: true, changes: [] as { topic:string; text:string; material:boolean }[] };
  const changes: {topic:string;text:string;material:boolean}[]=[];
  for (const key of ["fiscalYear","revenue","netIncome","debtToEquity","fairValue"] as const) {
    const a=previous[key], b=current[key];
    if(a===b)continue;
    changes.push({topic:key,text:`${key}: ${a ?? "unavailable"} → ${b ?? "unavailable"}`,material:key === "fiscalYear" || (a!=null && b!=null && Math.abs(b-a)/Math.max(Math.abs(a),0.0001)>=0.05)});
  }
  const fresh = current.newsIds.filter(id=>!previous.newsIds.includes(id));
  if(fresh.length)changes.push({topic:"News",text:`${fresh.length} newly ingested company-linked article(s).`,material:true});
  const holders = new Map(previous.ownership.map(h=>[h.name,h.percent]));
  for(const h of current.ownership)if(holders.has(h.name) && Math.abs(holders.get(h.name)!-h.percent)>=0.5)changes.push({topic:"Ownership",text:`${h.name}: disclosed stake ${holders.get(h.name)!.toFixed(2)}% → ${h.percent.toFixed(2)}%. Snapshot change does not prove a purchase or sale.`,material:true});
  return { baseline:false,changes };
}
export function scenarios(row: FinancialRow | undefined) {
  return [-0.1,0,0.1].map((growth,index)=>({name:["Bear","Base","Bull"][index]!,growthPercent:growth*100,
    revenue:finite(row?.revenue)?row.revenue*(1+growth):null,
    netIncome:finite(row?.netIncome)&&finite(row?.revenue)&&row.revenue>0?row.netIncome*(1+growth):null,
    assumption:"Illustrative one-year revenue change at constant net margin; no probability or price target is implied."}));
}
