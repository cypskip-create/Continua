import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStockFinancials } from "@/hooks/useStockFinancials";
import { useDividendHistory } from "@/hooks/useDividendHistory";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { useCorporateActions } from "@/hooks/useCorporateActions";
import { useResearch } from "@/hooks/useResearch";
import type { FiscalPeriodType } from "@/api/types";
import { EarningsFundamentals } from "./EarningsFundamentals";
import { FundamentalsInsights } from "./FundamentalsInsights";
import { StockSnowflake } from "./tabs/StockSnowflake";
import { FutureGrowthSection } from "./report/FutureGrowthSection";
import { PastPerformanceSection } from "./report/PastPerformanceSection";
import { FinancialHealthSection } from "./report/FinancialHealthSection";
import { RiskSection } from "./report/RiskSection";
import { ManagementSection } from "./report/ManagementSection";
import { Link } from "react-router-dom";
import { FinancialStatementExplorer } from "./FinancialStatementExplorer";
import { ValuationPreview, ResearchPreview } from "./FundamentalResearch";
import { OperationalEfficiency, SegmentDisclosure, ShareholderDisclosures } from "./FundamentalDisclosures";

type Panel = "financials" | "shareholders" | "dividends" | "profile";

function compact(value: number, currency = "KES") {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const scale = abs >= 1e12 ? 1e12 : abs >= 1e9 ? 1e9 : abs >= 1e6 ? 1e6 : abs >= 1e3 ? 1e3 : 1;
  const suffix = scale === 1e12 ? "T" : scale === 1e9 ? "B" : scale === 1e6 ? "M" : scale === 1e3 ? "K" : "";
  return `${currency} ${(value / scale).toFixed(scale === 1 ? 2 : 1)}${suffix}`;
}
const pct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
const tabClass = (active: boolean) => `shrink-0 px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-colors ${active ? "contrast-active" : "text-muted-foreground hover:text-foreground"}`;


export function StockFundamentals({ symbol, currency, price = 0, name = symbol, sector = "", marketCap = "—" }: { symbol: string; currency: string; price?: number; name?: string; sector?: string; marketCap?: string }) {
  const [panel, setPanel] = useState<Panel>("financials");
  const panelRoot = useRef<HTMLDivElement>(null);
  const previousPanel = useRef(panel);
  useLayoutEffect(() => {
    if (previousPanel.current !== panel) panelRoot.current?.scrollIntoView({block:"start",behavior:"instant"});
    previousPanel.current = panel;
  }, [panel]);
  const [periodType, setPeriodType] = useState<FiscalPeriodType>("annual");
  const { history, isLoading } = useStockFinancials(symbol, { periodType, limit: 10 });
  const { history: dividends } = useDividendHistory(symbol);
  const { profile } = useCompanyProfile(symbol);
  const { actions } = useCorporateActions(symbol);
  const { research } = useResearch(symbol);
  const sorted = useMemo(() => [...history].sort((a, b) => a.fiscalYear - b.fiscalYear || (a.fiscalQuarter ?? 0) - (b.fiscalQuarter ?? 0)), [history]);
  const recent = sorted[sorted.length - 1];
  const prior = sorted[sorted.length - 2];
  return <div ref={panelRoot} className="space-y-0" style={{scrollMarginTop:"calc(var(--sticky-header-height,0px) + var(--sticky-nav-height,0px))"}}>
    <div className="sticky top-[calc(var(--sticky-header-height,0px)+var(--sticky-nav-height,0px))] z-20 flex gap-1 overflow-x-auto scrollbar-hide border-b border-border/70 py-2 bg-background/95 backdrop-blur-xl" role="tablist" aria-label="Fundamentals category">
      {([ ["financials", "Financials"], ["shareholders", "Shareholders"], ["dividends", "Dividends"], ["profile", "Profile"] ] as const).map(([id, label]) =>
        <button data-small-target key={id} role="tab" aria-selected={panel === id} onClick={() => setPanel(id)} className={tabClass(panel === id)}>{label}</button>)}
    </div>
    {panel === "financials" && <>
      <section className="py-6"><StockSnowflake symbol={symbol} /></section>
      <Link to={`/engine?symbol=${encodeURIComponent(symbol)}`} className="flex items-center justify-between border-y border-border/70 py-4"><div><p className="text-sm font-semibold">Continua Engine</p><p className="text-xs text-muted-foreground">Company briefing, scenarios, technical analysis and alerts</p></div><span className="text-xs font-semibold text-primary">Premium →</span></Link>
      <EarningsFundamentals symbol={symbol} currency={currency} />
      <div className="flex flex-wrap items-center justify-between gap-3 py-5"><div><h3 className="text-lg font-semibold">Reported financials</h3><p className="text-xs text-muted-foreground">{recent?.reportedAt ? `Filed ${new Date(recent.reportedAt).toLocaleDateString()}` : "Company filings on record"} · {currency}</p></div><div className="flex gap-1" role="tablist" aria-label="Financial period"><button data-small-target role="tab" aria-selected={periodType === "annual"} onClick={() => setPeriodType("annual")} className={tabClass(periodType === "annual")}>Annual</button><button data-small-target role="tab" aria-selected={periodType === "quarterly"} onClick={() => setPeriodType("quarterly")} className={tabClass(periodType === "quarterly")}>Quarterly</button></div></div>
      {isLoading && !recent && <p className="py-8 text-sm text-muted-foreground">Loading reported statements…</p>}
      {recent && <section className="grid grid-cols-2 gap-4 pb-6 text-sm"><div><p className="text-muted-foreground">Revenue</p><p className="font-semibold">{recent.revenue == null ? "—" : compact(Number(recent.revenue), currency)}</p>{recent.revenue != null && prior?.revenue && <p className="text-xs text-muted-foreground">{pct(((Number(recent.revenue) - Number(prior.revenue)) / Math.abs(Number(prior.revenue))) * 100)} vs prior</p>}</div><div><p className="text-muted-foreground">Net income</p><p className="font-semibold">{recent.netIncome == null ? "—" : compact(Number(recent.netIncome), currency)}</p>{recent.netIncome != null && prior?.netIncome && <p className="text-xs text-muted-foreground">{pct(((Number(recent.netIncome) - Number(prior.netIncome)) / Math.abs(Number(prior.netIncome))) * 100)} vs prior</p>}</div></section>}
      <ResearchPreview symbol={symbol} currency={currency}/>
      <ValuationPreview symbol={symbol} name={name} sector={sector || profile?.company.sectorName || ""} price={price} currency={currency}/>
      <SegmentDisclosure symbol={symbol} currency={currency}/>
      <OperationalEfficiency symbol={symbol} currency={currency} employees={profile?.company.employees} history={sorted}/>
      {(["Financial indicators","Income statement","Balance sheet","Cash flows"] as const).map(title=><FinancialStatementExplorer key={`${title}-${periodType}`} title={title} symbol={symbol} history={sorted} currency={currency} periodType={periodType}/>)}
      <details className="border-t border-border py-3"><summary className="text-base font-semibold cursor-pointer">Value signal, returns and scenario forecast</summary><FundamentalsInsights symbol={symbol} currency={currency}/></details>
      <section className="border-t border-border/70 py-6"><FutureGrowthSection symbol={symbol} /></section>
      <details className="border-t border-border/70 py-5"><summary className="cursor-pointer text-base font-semibold">Past performance</summary><div className="pt-5"><PastPerformanceSection symbol={symbol} currency={currency} /></div></details>
      <details className="border-t border-border/70 py-5"><summary className="cursor-pointer text-base font-semibold">Financial health</summary><div className="pt-5"><FinancialHealthSection symbol={symbol} currency={currency} /></div></details>
      <details className="border-t border-border/70 py-5"><summary className="cursor-pointer text-base font-semibold">Risk analysis</summary><div className="pt-5"><RiskSection symbol={symbol} /></div></details>
    </>}
    {panel === "shareholders" && <ShareholderDisclosures symbol={symbol} currency={currency}/>}
    {panel === "dividends" && <><section className="py-6"><h3 className="text-lg font-semibold">Dividends</h3><div className="grid grid-cols-2 gap-4 mt-5 text-sm"><div><p className="text-muted-foreground">Latest dividend per share</p><p className="text-lg font-semibold">{dividends.length ? compact(dividends[dividends.length - 1].dps, currency) : "—"}</p></div><div><p className="text-muted-foreground">Dividend yield</p><p className="text-lg font-semibold">{research?.ratios.dividendYield != null ? `${(Number(research.ratios.dividendYield) * 100).toFixed(2)}%` : "—"}</p></div></div>{dividends.length ? <div className="mt-6 space-y-3">{dividends.map(row => <div key={row.year} className="flex justify-between border-b border-border/60 pb-2 text-sm"><span>{row.year}</span><span className="font-semibold">{compact(row.dps, currency)}</span></div>)}</div> : <p className="mt-5 text-sm text-muted-foreground">No verified dividend payments are on file.</p>}</section><section className="border-t border-border/70 py-6"><h3 className="text-lg font-semibold">Stock splits and actions</h3>{actions.filter(a => a.type === "split" || a.type === "bonus_issue").length ? actions.filter(a => a.type === "split" || a.type === "bonus_issue").map(a => <div key={a.id} className="flex justify-between border-b border-border/60 py-3 text-sm"><span className="capitalize">{a.type.replace("_", " ")}</span><span>{new Date(a.effectiveDate ?? a.announcedAt).toLocaleDateString()}</span></div>) : <p className="mt-4 text-sm text-muted-foreground">No verified splits are on file.</p>}</section></>}
    {panel === "profile" && <section className="py-6 space-y-6"><div><h3 className="text-lg font-semibold">Company overview</h3><p className="mt-3 text-sm leading-relaxed">{profile?.company.description || "A verified company description is not available yet."}</p></div><div className="border-t border-border/70 pt-5"><h3 className="text-lg font-semibold">Category and leadership</h3><dl className="mt-4 divide-y divide-border/70 text-sm">{[["Industry", profile?.company.sectorName], ["Headquarters", profile?.company.headquarters], ["Founded", profile?.company.founded], ["CEO", profile?.company.ceo], ["Employees", profile?.company.employees]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-right">{value || "—"}</dd></div>)}</dl></div></section>}
    {panel === "profile" && <section className="border-t border-border/70 py-6"><ManagementSection symbol={symbol} /></section>}
  </div>;
}
