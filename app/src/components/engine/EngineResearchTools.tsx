import { useState } from "react";
import type { EngineBundle } from "@/api/engineApi";
import type { EnginePortfolio, MonitorRule } from "@/api/engineWorkspaceApi";
import { financialNumber, financialPercent, financialPeriod, finiteFinancial } from "@/lib/financialPresentation";
import { concentration, multipleSensitivity, ownershipSnapshot, reportBridge } from "@/lib/engineResearch";
import { useStockFinancials } from "@/hooks/useStockFinancials";
import { BasicPriceForecast, ValueSignal } from "@/components/stock/ValueSignal";
import { EarningsFundamentals } from "@/components/stock/EarningsFundamentals";
import { EarningsMovePreview } from "@/components/stock/EarningsDetail";
import { FinancialStatementExplorer } from "@/components/stock/FinancialStatementExplorer";
import { GrowthWorkbench, RiskWorkbench, ScenarioWorkbench, ScorecardWorkbench, ResearchNumber, ResearchTable } from "@/components/stock/ForecastWorkbenches";
const control = "rounded-lg border border-border bg-background px-3 py-2 text-sm max-w-full";
const help = "text-sm text-muted-foreground";
export function ExportResearch({ name, data }: {
    name: string;
    data: unknown;
}) {
    return <button type="button" className={control} onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = `${name.replace(/[^a-z0-9-]/gi, "-")}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Export research snapshot</button>;
}
export function EngineForecastDesk({ symbol, currency }: {
    symbol: string;
    currency: string;
}) {
    const [view, setView] = useState("Price paths");
    return <section className="space-y-4"><h3 className="text-xl font-semibold">Company Forecast</h3><p className={help}>Keep forward-looking research together. Separate sourced estimates from your own assumptions; price paths are illustrations, not analyst targets.</p><label className="block text-sm">Forecast workbench<select aria-label="Forecast workbench" className={control + " block mt-2"} value={view} onChange={e => setView(e.target.value)}>{["Price paths", "Estimates & coverage", "Value signal research", "Growth quality", "Company scorecard"].map(v => <option key={v}>{v}</option>)}</select></label>
    {view === "Price paths" && <BasicPriceForecast symbol={symbol} currency={currency} expanded/>}
    {view === "Estimates & coverage" && <EarningsFundamentals symbol={symbol} currency={currency} mode="forecast"/>}
    {view === "Value signal research" && <ValueSignal symbol={symbol} currency={currency} expanded/>}
    {view === "Growth quality" && <GrowthWorkbench symbol={symbol} currency={currency}/>}
    {view === "Company scorecard" && <ScorecardWorkbench symbol={symbol}/>}
  </section>;
}
export function EngineReportsDesk({ data }: {
    data: EngineBundle;
}) {
    const [period, setPeriod] = useState<"annual" | "quarterly">("annual"), [statement, setStatement] = useState("Income statement");
    const filings = useStockFinancials(data.symbol, { periodType: period, limit: 10 });
    const bridge = reportBridge(filings.history);
    return <section className="space-y-5"><h3 className="text-xl font-semibold">Earnings & Reports</h3><p className={help}>Reported results, release-window moves and financial statements. Forward estimates and analyst coverage are now in Forecast.</p><EarningsFundamentals symbol={data.symbol} currency={data.currency} mode="reported"/><EarningsMovePreview symbol={data.symbol} currency={data.currency} events={data.earnings ?? []}/>
    <div className="flex flex-wrap gap-3"><label className="text-sm">Reporting basis<select aria-label="Reports period" className={control + " block mt-1"} value={period} onChange={e => setPeriod(e.target.value as typeof period)}><option value="annual">Annual</option><option value="quarterly">Quarterly</option></select></label><label className="text-sm">Statement<select aria-label="Reports statement" className={control + " block mt-1"} value={statement} onChange={e => setStatement(e.target.value)}>{["Income statement", "Balance sheet", "Cash flows", "Financial indicators"].map(v => <option key={v}>{v}</option>)}</select></label></div>
    {filings.historyError ? <p role="alert">Filings could not load. <button className={control} onClick={() => void filings.refetchHistory()}>Retry filings</button></p> : filings.isLoading ? <p role="status">Loading filings…</p> : <><FinancialStatementExplorer key={statement + period} title={statement} history={filings.history} currency={data.currency} periodType={period} symbol={data.symbol}/><h4 className="text-lg font-semibold">Profit-to-cash period bridge</h4><ResearchTable headers={["Period / currency", "Revenue YoY", "Net margin", "Cash / profit", "Cash − profit"]} rows={bridge.map(r => [`${financialPeriod(r.row)} · ${r.row.currency??"Currency unavailable"}`, financialPercent(r.revenueGrowth), financialPercent(r.margin), r.cashConversion == null ? "—" : `${r.cashConversion.toFixed(2)}×`, financialNumber(r.cashProfitGap, r.row.currency)])}/><p className={help}>YoY uses the exact preceding fiscal year and matching quarter/currency. Cash conversion is withheld for losses or zero earnings. Cash minus profit is a diagnostic gap, not proof of poor reporting. Closing balances and quarterly ratios are not annualised; banks need sector-specific interpretation.</p><ExportResearch name={`${data.symbol}-reports`} data={{ generatedAt: data.generatedAt, period, bridge, limitations: "Reported fields only; missing periods are not interpolated." }}/></>}
  </section>;
}
export function BriefingDecisionDesk({ data }: {
    data: EngineBundle;
}) {
    const [checked, setChecked] = useState<string[]>([]);
    const questions = ["Period and currency match my comparison", "Valuation assumptions are understood", "Cash flow and debt have been reviewed", "Contradictory evidence has been checked"];
    return <section className="space-y-3 border-t border-border pt-5"><h3 className="text-lg font-semibold">Research readiness</h3><p className={help}>A session checklist, not a buy/sell score. Save your conclusions in Journal.</p>{questions.map(q => <label key={q} className="flex items-start gap-3 text-sm"><input type="checkbox" checked={checked.includes(q)} onChange={e => setChecked(e.target.checked ? [...checked, q] : checked.filter(v => v !== q))} className="mt-1 accent-primary"/>{q}</label>)}<p className={help}>{checked.length}/{questions.length} reviewed · {data.unavailable?.length ?? 0} disclosed data gaps</p><details><summary className="text-sm font-semibold">Questions still needing evidence</summary>{(data.unavailable ?? []).map((v, i) => <p key={i} className={help + " mt-2"}>{v}</p>)}{!data.unavailable?.length && <p className={help}>No gaps listed by this response; that does not establish complete coverage.</p>}</details><ExportResearch name={`${data.symbol}-briefing`} data={{ symbol: data.symbol, generatedAt: data.generatedAt, briefing: data.briefing, reviewed: checked, quality: data.quality, unavailable: data.unavailable }}/></section>;
}
export function EvidenceLedger({ data }: {
    data: EngineBundle;
}) {
    const [search, setSearch] = useState("");
    const rows = [{ type: "Quote", date: data.quality?.quoteAsOf, detail: data.quality?.quoteSource ?? "Source unavailable" }, ...data.history.map(r => ({ type: "Filing", date: r.reportedAt, detail: `${financialPeriod(r)} · ${r.currency ?? "Currency unavailable"}` })), ...data.ownership.map(r => ({ type: "Ownership", date: r.asOf, detail: r.holderName })), ...data.news.map(r => ({ type: "News", date: r.publishedAt, detail: `${r.source} · ${r.headline}` })), ...(data.valuation?.models ?? []).map(r => ({ type: "Model", date: null, detail: `${r.model} · calculated, not a sourced analyst target` }))];
    const shown = rows.filter(r => `${r.type} ${r.detail} ${r.date ?? ""}`.toLowerCase().includes(search.toLowerCase()));
    return <section className="space-y-3 border-t border-border pt-5"><h3 className="text-lg font-semibold">Evidence ledger</h3><input aria-label="Filter evidence ledger" className={control + " w-full"} placeholder="Filter filings, dates, sources or shareholders" value={search} onChange={e => setSearch(e.target.value)}/><p className={help}>{shown.length}/{rows.length} records · {rows.filter(r => !r.date).length} without a source date. Generated {data.generatedAt}; generation time is not evidence freshness.</p><ResearchTable headers={["Evidence", "As of / filed", "Record"]} rows={shown.map(r => [r.type, r.date ?? "Date unavailable", r.detail])}/><ExportResearch name={`${data.symbol}-evidence`} data={{ generatedAt: data.generatedAt, records: shown, warnings: data.quality?.warnings, unavailable: data.unavailable }}/></section>;
}
export function ValuationSensitivityDesk({ data }: {
    data: EngineBundle;
}) {
    const [multiple, setMultiple] = useState(10), [stress, setStress] = useState(0);
    const annual = [...data.history].filter(r => !r.fiscalQuarter).sort((a, b) => b.fiscalYear - a.fiscalYear)[0];
    const eps = finiteFinancial(annual?.eps), matching = annual?.currency === data.currency;
    const price = finiteFinancial(data.quote?.lastPrice), value = matching ? multipleSensitivity(eps, stress, multiple) : null;
    return <section className="space-y-4 border-t border-border py-5"><h3 className="text-lg font-semibold">Earnings multiple sensitivity</h3><p className={help}>Anchor: {annual?.fiscalYear ?? "—"} reported EPS {financialNumber(eps, annual?.currency ?? data.currency)}. Simple EPS × assumed P/E, not a DCF or analyst forecast. Nonpositive EPS or currency mismatch withholds values.</p><ResearchNumber label="Assumed P/E multiple" value={multiple} onChange={setMultiple} min={0} max={100}/><ResearchNumber label="EPS stress %" value={stress} onChange={setStress} min={-100} max={100}/><p className="text-sm">Illustrative value <strong>{financialNumber(value, data.currency)}</strong> · relative to quoted price {financialPercent(value != null && price != null && price > 0 ? (value / price - 1) * 100 : null)}</p><ResearchTable headers={["EPS stress", `${Math.max(0, multiple - 5)}×`, `${multiple}×`, `${multiple + 5}×`]} rows={[-20, 0, 20].map(delta => { const s = Math.max(-100, Math.min(100, stress + delta)); return [financialPercent(s), ...[Math.max(0, multiple - 5), multiple, multiple + 5].map(m => financialNumber(matching ? multipleSensitivity(eps, s, m) : null, data.currency))]; })}/><p className={help}>Does not adjust for dilution, funding, debt, dividends or changes in share basis. Check the quote date in Evidence before comparing.</p><ExportResearch name={`${data.symbol}-multiple-sensitivity`} data={{ annual, quote: data.quote, assumptions: { multiple, stress }, illustrativeValue: value }}/></section>;
}
export function OwnershipAuditDesk({ data }: {
    data: EngineBundle;
}) {
    const dates = [...new Set(data.ownership.map(r => r.asOf))].sort().reverse();
    const [date, setDate] = useState(dates[0] ?? ""), [kind, setKind] = useState("all");
    const snapshot = ownershipSnapshot(data.ownership, date);
    const shown = snapshot.rows.filter(r => kind === "all" || r.holderType === kind).sort((a, b) => (finiteFinancial(b.percentHeld) ?? -1) - (finiteFinancial(a.percentHeld) ?? -1));
    return <section className="space-y-4"><h3 className="text-lg font-semibold">Ownership disclosure audit</h3><div className="flex flex-wrap gap-3"><label className="text-sm">Disclosure date<select aria-label="Ownership disclosure date" className={control + " block mt-1"} value={date} onChange={e => setDate(e.target.value)}>{dates.map(d => <option key={d}>{d}</option>)}</select></label><label className="text-sm">Holder type<select aria-label="Ownership holder type" className={control + " block mt-1"} value={kind} onChange={e => setKind(e.target.value)}>{["all", ...new Set(snapshot.rows.map(r => r.holderType))].map(k => <option key={k}>{k}</option>)}</select></label></div><p className={help}>Same-date disclosed total: {snapshot.disclosedPercent == null ? "—" : `${snapshot.disclosedPercent.toFixed(2)}%`} · {snapshot.invalid} missing/invalid percentages. This is reported coverage, not free float.</p>{snapshot.disclosedPercent != null && snapshot.disclosedPercent > 100 && <p role="alert">Disclosures total over 100%. Potential overlapping classifications: do not sum these as unique beneficial ownership.</p>}<ResearchTable headers={["Holder", "Type", "Shares", "Reported %"]} rows={shown.map(r => [r.holderName, r.holderType, financialNumber(r.sharesHeld), r.percentHeld == null ? "—" : `${Number(r.percentHeld).toFixed(2)}%`])}/><p className={help}>Snapshots do not show purchases, sales, insider transactions or control arrangements. Different dates are never combined; “Other” may aggregate many holders.</p><ExportResearch name={`${data.symbol}-ownership`} data={{ date, records: shown, limitations: "Disclosure snapshot only; no inferred fund flows." }}/></section>;
}
export function TechnicalResearchDesk({ symbol }: {
    symbol: string;
}) {
    const [view, setView] = useState("History & drawdown");
    return <section className="border-t border-border pt-5 space-y-3"><h3 className="text-lg font-semibold">Price risk research</h3><label className="text-sm">Research lens<select aria-label="Technical research lens" className={control + " block mt-1"} value={view} onChange={e => setView(e.target.value)}><option>History & drawdown</option><option>Risk evidence</option></select></label><RiskWorkbench symbol={symbol} mode={view === "Risk evidence" ? "snowflake" : "history"}/></section>;
}
export { ScenarioWorkbench };
export function PortfolioDiagnostics({ data }: {
    data: EnginePortfolio;
}) {
    const [onlyGaps, setOnlyGaps] = useState(false), [minimumCorrelation, setMinimumCorrelation] = useState(.5);
    const c = concentration(data.positions.map(p => p.weight));
    const companies = data.researchBriefing?.companies ?? [];
    const shown = companies.filter(p => !onlyGaps || p.qualityWarnings.length || p.unavailable.length || p.risks.length);
    const pairs = data.correlations.pairs.filter(p => p.correlation != null && Number.isFinite(p.correlation) && Math.abs(p.correlation) >= minimumCorrelation).sort((a, b) => Math.abs(b.correlation!) - Math.abs(a.correlation!));
    return <section className="space-y-3 border-t border-border pt-5"><h3 className="text-lg font-semibold">Portfolio research queue</h3><p className={help}>Top-three concentration {financialPercent(c.topThree)} · effective holdings {c.effectiveHoldings?.toFixed(2) ?? "—"}. Normalised over covered positive weights, not your whole wealth; effective holdings = 1 / sum(weight²).</p><label className="flex gap-2 text-sm"><input type="checkbox" checked={onlyGaps} onChange={e => setOnlyGaps(e.target.checked)}/>Only companies with risks or evidence gaps</label>{shown.map(p => <details key={p.symbol} className="border-t border-border py-3"><summary className="text-sm font-semibold">{p.symbol} · {financialPercent(p.weight * 100)} · FY{p.period ?? "—"}</summary>{[...p.findings, ...p.risks, ...p.qualityWarnings, ...p.unavailable].map((v, i) => <p key={i} className={help + " mt-2"}>{v}</p>)}{!p.findings.length && !p.risks.length && !p.qualityWarnings.length && !p.unavailable.length && <p className={help}>No findings supplied; this is not confirmation of low risk.</p>}</details>)}{!shown.length && <p className={help}>No matching company research in this response.</p>}<p className={help}>{data.researchBriefing?.methodology ?? "Company research coverage unavailable."}</p><details className="border-t border-border pt-3"><summary className="text-sm font-semibold">Co-movement review</summary><div className="space-y-3 py-3"><ResearchNumber label="Minimum absolute correlation" value={minimumCorrelation} onChange={setMinimumCorrelation} min={0} max={1}/><ResearchTable headers={["Pair", "Observed correlation"]} rows={pairs.map(p => [`${p.a} / ${p.b}`, p.correlation!.toFixed(2)])}/><p className={help}>{data.correlations.methodology} No matching pairs is not proof of diversification. Historical co-movement can change during stress.</p></div></details><ExportResearch name="portfolio-research" data={{ concentration: c, coverage: data.coverage, risk: data.risk, companies: shown, warnings: data.warnings }}/></section>;
}
export function MonitoringReview({ rules }: {
    rules: MonitorRule[];
}) {
    const awaiting = rules.filter(r => r.enabled && !r.last_state?.checkedAt), gaps = rules.filter(r => r.enabled && (r.last_state?.unavailable || r.last_state?.error));
    return <div className="space-y-2 border-y border-border py-3"><h4 className="font-semibold text-sm">Monitoring health</h4><p className={help}>{rules.filter(r => r.enabled).length} active · {awaiting.length} awaiting first check · {gaps.length} with missing inputs/errors. Check timestamps in each rule; active is not proof of a successful recent check.</p><details><summary className="text-sm">Rules needing attention</summary>{[...awaiting, ...gaps].map(r => <p key={r.id} className={help + " mt-2"}>{r.symbol} · {r.kind.replace(/_/g, " ")} · {r.last_state?.error ?? (r.last_state?.unavailable ? "Input unavailable" : "Awaiting a check")}</p>)}</details><ExportResearch name="monitoring-health" data={rules}/></div>;
}
type Peer = {
    symbol: string;
    name: string;
    period: number | null;
    metrics: Record<string, number | null>;
};
export function PeerResearchMatrix({ peers }: {
    peers: Peer[];
}) {
    const [metric, setMetric] = useState("revenueGrowth"), [year, setYear] = useState("all");
    const years = [...new Set(peers.map(p => p.period).filter((v): v is number => v != null))].sort((a, b) => b - a);
    const shown = peers.filter(p => year === "all" || String(p.period) === year).sort((a, b) => (finiteFinancial(b.metrics[metric]) ?? -Infinity) - (finiteFinancial(a.metrics[metric]) ?? -Infinity));
    return <section className="space-y-3"><h4 className="text-lg font-semibold">Comparable-period matrix</h4><div className="flex flex-wrap gap-3"><label className="text-sm">Sort metric<select aria-label="Peer matrix metric" className={control + " block mt-1"} value={metric} onChange={e => setMetric(e.target.value)}>{["revenueGrowth", "earningsGrowth", "cashConversion", "debtToEquity"].map(v => <option key={v} value={v}>{v.replace(/([A-Z])/g, " $1")}</option>)}</select></label><label className="text-sm">Fiscal year<select aria-label="Peer matrix fiscal year" className={control + " block mt-1"} value={year} onChange={e => setYear(e.target.value)}><option value="all">All disclosed years</option>{years.map(v => <option key={v}>{v}</option>)}</select></label></div><ResearchTable headers={["Company / year", "Revenue growth", "Earnings growth", "Cash / profit", "Debt / equity"]} rows={shown.map(p => [`${p.symbol} · FY${p.period ?? "—"}`, financialPercent(p.metrics.revenueGrowth ?? null), financialPercent(p.metrics.earningsGrowth ?? null), p.metrics.cashConversion == null ? "—" : `${p.metrics.cashConversion.toFixed(2)}×`, p.metrics.debtToEquity == null ? "—" : `${p.metrics.debtToEquity.toFixed(2)}×`])}/><p className={help}>Sorted observations, not investment rankings. Select a single year to avoid period mixing; accounting basis, sector-specific ratios and source coverage can still differ.</p><ExportResearch name="peer-comparison" data={{ metric, year, records: shown }}/></section>;
}
