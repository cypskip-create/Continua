import type { EnginePortfolio, EnginePortfolioOverview } from "@/api/engineWorkspaceApi";
import { EngineAssistantPanel } from "@/components/engine/EngineWorkspace";
import { EnginePortfolioPanel, EngineMonitoringPanel } from "@/components/engine/EngineWorkspace";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PortfolioReviewDesk } from "@/components/engine/PortfolioReviewDesk";

const numeric = (n: number | null | undefined) => n == null ? "Unavailable" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function PortfolioEngineOverview({ data, loading, error, showValues }: {
  data?: EnginePortfolioOverview; loading: boolean; error: unknown; showValues: boolean;
}) {
  return <section aria-label="Engine portfolio overview" className="space-y-3 border-t border-border pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Engine portfolio overview</h3><span className="text-xs text-muted-foreground">Included free</span></div>
    {loading && <p role="status" className="text-xs text-muted-foreground">Checking your dated holdings…</p>}
    {!!error && <p role="alert" className="text-xs text-muted-foreground">Engine overview could not load. Your holdings and existing portfolio tools remain available.</p>}
    {data && <>
      <p className="text-sm">{data.holdingCount ? `${data.pricedCount} of ${data.holdingCount} holdings priced` : "Add your first holding to start portfolio research."}{data.sessionDate ? ` · session ${data.sessionDate}` : ""}</p>
      {data.holdingCount > 0 && <div className="grid grid-cols-2 gap-3 text-xs">
        <div><p className="text-muted-foreground">Unrealized change · covered holdings</p><p className="mt-1 font-semibold">{showValues ? `${data.currency ?? ""} ${numeric(data.unrealized)}` : "••••"}</p></div>
        <div><p className="text-muted-foreground">Latest-session contribution</p><p className="mt-1 font-semibold">{showValues ? `${data.currency ?? ""} ${numeric(data.sessionPnl)}` : "••••"}</p></div>
      </div>}
      {data.warnings.map(w => <p key={w} className="text-xs text-muted-foreground">{w}</p>)}
      <p className="text-xs text-muted-foreground">{data.methodology}</p>
    </>}
  </section>;
}

export function PortfolioEngineBriefing({ data, showValues }: { data: EnginePortfolio; showValues: boolean }) {
  const research = data.researchBriefing;
  return <section className="space-y-4" aria-label="Engine portfolio research">
    <h3 className="text-lg font-semibold">Your portfolio research briefing</h3>
    <p className="text-xs text-muted-foreground">Calculated research uses no OpenAI tokens. Portfolio questions call OpenAI only after you submit them.</p>
    {research && <>
      <p className="text-xs text-muted-foreground">{research.covered} of {research.requested} priced holdings covered · {research.methodology}</p>
      {research.companies.map(company => <details key={company.symbol} className="border-t border-border pt-3 space-y-2"><summary className="cursor-pointer text-sm font-semibold">{company.symbol} · FY{company.period ?? "Unavailable"} · {numeric(company.weight * 100)}% weight</summary>
        <Link to={`/engine?symbol=${encodeURIComponent(company.symbol)}`} className="text-sm font-semibold text-primary">{company.symbol} · FY{company.period ?? "Unavailable"}</Link>
        <p className="text-xs text-muted-foreground">{numeric(company.weight * 100)}% of covered value</p>
        <p className="text-xs">Revenue growth {numeric(company.metrics.revenueGrowth)}% · cash conversion {numeric(company.metrics.cashConversion)}× · debt/equity {numeric(company.metrics.debtToEquity)}×</p>
        {company.sectorNote && <p className="text-xs text-muted-foreground">{company.sectorNote}</p>}
        {company.facts?.map(f => <p key={f} className="text-xs">{f}</p>)}
        {company.findings.map(f => <p key={f} className="text-sm">{f}</p>)}
        {company.risks.map(r => <p key={r} className="text-xs text-muted-foreground">{r}</p>)}
        {company.changes.map((c, i) => <p key={i} className="text-xs"><strong>{c.topic}</strong> · {c.text}</p>)}
        {company.qualityWarnings.map(w => <p key={w} className="text-xs text-muted-foreground">{w}</p>)}
        {company.unavailable.length > 0 && <p className="text-xs text-muted-foreground">Missing: {company.unavailable.join(", ")}</p>}
      </details>)}
      <div className="border-t border-border pt-3 space-y-3"><h4 className="text-sm font-semibold">News affecting your holdings</h4>
        {research.news.map(n => <article key={n.symbol + n.id}><a href={/^https?:\/\//i.test(n.url) ? n.url : undefined} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary">{n.symbol} · {n.headline}</a><p className="mt-1 text-sm">{n.summary}</p><p className="mt-1 text-xs text-muted-foreground">{n.source} · {n.publishedAt ?? "Date unavailable"}</p></article>)}
        {!research.news.length && <p className="text-xs text-muted-foreground">No verified company-linked news was found.</p>}
      </div>
    </>}
    {data.risk && <p className="text-xs text-muted-foreground">{data.risk.reason} Covered portfolio weight: {numeric(data.risk.coveredWeight * 100)}% · {data.risk.observations} aligned returns.</p>}
    {!showValues && <p className="text-xs text-muted-foreground">Amounts and the portfolio assistant are hidden while your balance is hidden.</p>}
  </section>;
}

export function PortfolioEngineAssistant({ exchange, symbols }: { exchange: string; symbols: string[] }) {
  return <EngineAssistantPanel symbol={symbols[0] ?? "KCB"} exchange={exchange} initialScope="portfolio" portfolioOnly />;
}

export function PortfolioEngineWorkspace({ data, showValues, exchange, symbols }: {
  data: EnginePortfolio; showValues: boolean; exchange: string; symbols: string[];
}) {
  const [tool, setTool] = useState("Briefing");
  const [selection, setSelection] = useState(symbols[0] ?? "");
  const symbol = symbols.includes(selection) ? selection : symbols[0];
  return <section className="space-y-4 border-b border-border pb-5" aria-label="Premium portfolio Engine">
    <div className="flex flex-wrap justify-between gap-2"><h3 className="text-lg font-semibold">Portfolio Engine</h3><span className="text-xs text-muted-foreground">Premium research</span></div>
    <div role="tablist" aria-label="Portfolio Engine tools" className="flex gap-1 overflow-x-auto scrollbar-hide">
      {["Briefing", "Review desk", "Returns & income", "Ask Engine", "Monitoring"].map(item => <button key={item} role="tab" aria-selected={tool === item} className={`pill-tab h-8 shrink-0 ${tool === item ? "contrast-active" : ""}`} onClick={() => setTool(item)}>{item}</button>)}
    </div>
    {tool === "Briefing" && <PortfolioEngineBriefing data={data} showValues={showValues} />}
    {tool === "Review desk" && (showValues?<PortfolioReviewDesk data={data} />:<p className="text-xs text-muted-foreground">Show portfolio values to use this tool.</p>)}
    {(tool === "Returns & income" || tool === "Ask Engine") && !showValues && <p className="text-xs text-muted-foreground">Show portfolio values to use this tool.</p>}
    {tool === "Returns & income" && showValues && <EnginePortfolioPanel exchange={exchange} />}
    {tool === "Ask Engine" && showValues && <PortfolioEngineAssistant exchange={exchange} symbols={symbols} />}
    {tool === "Monitoring" && symbol && <div className="space-y-4"><label className="text-xs flex flex-col gap-1">Choose a holding<select aria-label="Portfolio monitoring holding" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={symbol} onChange={e => setSelection(e.target.value)}>{symbols.map(s => <option key={s} value={s}>{s}</option>)}</select></label><EngineMonitoringPanel key={symbol} symbol={symbol} exchange={exchange} /></div>}
  </section>;
}
