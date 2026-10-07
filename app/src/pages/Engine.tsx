import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RefreshCw, Zap } from "lucide-react";
import { engineApi, type EngineBundle } from "@/api/engineApi";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useExchange } from "@/hooks/useExchange";
import { useInstruments } from "@/hooks/useInstruments";
import { navigateBack } from "@/lib/navigation";
import { TechnicalsTab } from "@/components/stock/tabs/TechnicalsTab";
import { StockAlertDialog } from "@/components/alerts/StockAlertDialog";
import { FundamentalsInsights } from "@/components/stock/FundamentalsInsights";
import { EarningsFundamentals } from "@/components/stock/EarningsFundamentals";

const tools = ["Briefing", "Earnings & forecasts", "Valuation", "Ownership", "Technicals", "Scenario lab"] as const;
type Tool = typeof tools[number];
const money = (value: number | null | undefined, currency: string) => value == null || !Number.isFinite(Number(value)) ? "—" : `${currency} ${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function Engine() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const { exchange, exchangeMeta } = useExchange();
  const { instruments } = useInstruments();
  const symbol = (params.get("symbol") || instruments[0]?.symbol || "KCB").toUpperCase();
  const [tool, setTool] = useState<Tool>("Briefing");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const refreshAnalysis = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await queryClient.invalidateQueries({ queryKey: ["continua"], refetchType: "active" }); }
    finally { setRefreshing(false); }
  };
  const paid = ["premium", "premium_plus"].includes(profile?.subscription_plan ?? "");
  const query = useQuery({
    queryKey: ["continua", "engine", user?.id, exchange, symbol],
    queryFn: () => engineApi.get(symbol, exchange), enabled: paid && !!user,
    staleTime: 60_000, retry: false,
  });
  const data = query.data;
  return <div className="min-h-screen bg-background pb-24">
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-4 py-3"><button aria-label="Back" onClick={() => navigateBack(navigate, "/")} className="p-2"><ArrowLeft className="h-5 w-5" /></button><Zap className="h-5 w-5 text-primary" /><h1 className="text-lg font-semibold">Continua Engine</h1><span className="ml-auto text-xs text-muted-foreground">Premium</span></div>
    </header>
    <main className="mx-auto max-w-3xl px-4">
      <section className="border-b border-border/70 py-6"><h2 className="text-2xl font-semibold tracking-tight">Understand your investments</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Connect company fundamentals, earnings, valuation, ownership and technical signals in one analysis workspace.</p></section>
      {profileLoading ? <p role="status" className="py-10 text-sm text-muted-foreground">Checking membership…</p> : !paid ? <section className="py-6 space-y-5"><h3 className="text-lg font-semibold">Engine is included with Premium</h3><div className="divide-y divide-border/70">{[
        ["Fundamental Engine", "Calculated company briefings, earnings, forecasts, model valuations and disclosed shareholders."],
        ["Technical Engine", "Indicators, daily volume profiles, historical signal backtesting and custom alerts."],
        ["Scenario lab", "Explore revenue and profit growth assumptions using company filings."],
      ].map(([title, detail]) => <div key={title} className="py-4"><h4 className="font-semibold">{title}</h4><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div>)}</div><Link to="/upgrade" className="inline-block rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background">Unlock Continua Engine</Link><p className="text-xs text-muted-foreground">Your free Fundamentals allowance remains available on stock pages.</p></section> : <>
        <section className="flex items-center justify-between gap-3 border-b border-border/70 py-4"><label className="text-xs text-muted-foreground">Stock · {exchangeMeta.code}<select aria-label="Engine stock" value={symbol} onChange={(event) => { setParams({ symbol: event.target.value }); setTool("Briefing"); }} className="ml-3 max-w-52 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">{[...new Set([symbol, ...instruments.map(item => item.symbol)])].map(item => <option key={item} value={item}>{item}</option>)}</select></label><button aria-label="Refresh Engine analysis" onClick={() => void refreshAnalysis()} disabled={refreshing || query.isFetching} className="p-2"><RefreshCw className={`h-4 w-4 ${refreshing || query.isFetching ? "animate-spin" : ""}`} /></button></section>
        <div className="flex gap-1 overflow-x-auto border-b border-border/70 py-3 scrollbar-hide" role="tablist" aria-label="Engine tools">{tools.map(item => <button key={item} role="tab" aria-selected={tool === item} onClick={() => setTool(item)} className={`shrink-0 rounded-full px-3 py-2 text-xs ${tool === item ? "bg-foreground font-semibold text-background" : "text-muted-foreground"}`}>{item}</button>)}</div>
        {query.isLoading ? <p role="status" className="py-10 text-sm text-muted-foreground">Preparing your analysis…</p> : query.isError ? <div className="py-8 space-y-3"><p role="alert" className="text-sm text-muted-foreground">{query.error.message}</p><button className="text-sm font-semibold text-primary" onClick={() => void query.refetch()}>Retry analysis</button></div> : data && <div key={`${exchange}:${symbol}`} className="py-6 space-y-6">
          <div><h2 className="text-lg font-semibold">{data.companyName}</h2><p className="mt-1 text-xs text-muted-foreground">{symbol} · {money(data.quote?.lastPrice, data.currency)} · Updated {new Date(data.generatedAt).toLocaleString()}</p></div>
          {tool === "Briefing" && <Briefing data={data} />}
          {tool === "Earnings & forecasts" && <><EarningsFundamentals symbol={symbol} currency={data.currency} /><FundamentalsInsights symbol={symbol} currency={data.currency} /></>}
          {tool === "Valuation" && <section className="divide-y divide-border/70">{data.valuation?.models.map(model => <div key={model.model} className="py-4 space-y-2"><div className="flex justify-between gap-3"><h3 className="text-sm font-semibold">{model.model}</h3><span className="text-sm font-semibold">{money(model.fairValue, data.currency)}</span></div><p className="text-xs text-muted-foreground">{model.fairValue == null ? model.unavailableReason : `${Number(model.upsidePercent).toFixed(1)}% model-implied upside`}</p><p className="text-xs leading-relaxed text-muted-foreground">{model.methodology}</p></div>) ?? <p className="text-sm text-muted-foreground">No usable valuation inputs yet.</p>}</section>}
          {tool === "Ownership" && <section><h3 className="text-lg font-semibold">Smart money tracker</h3><p className="mt-2 text-xs text-muted-foreground">Company-disclosed shareholders and ownership percentages.</p><div className="mt-4 divide-y divide-border/70">{data.ownership.map(holder => <div key={holder.holderName} className="flex justify-between gap-3 py-3 text-sm"><div><p className="font-semibold">{holder.holderName}</p><p className="text-xs capitalize text-muted-foreground">{holder.holderType} · {new Date(holder.asOf).toLocaleDateString()}</p></div><span className="font-semibold">{Number(holder.percentHeld).toFixed(2)}%</span></div>)}</div>{!data.ownership.length && <p className="py-6 text-sm text-muted-foreground">No shareholder disclosures are on file yet.</p>}<p className="mt-4 text-xs text-muted-foreground">Insider transaction history is unavailable; ownership snapshots do not show purchases or sales.</p></section>}
          {tool === "Technicals" && <><TechnicalsTab symbol={symbol} currency={data.currency} /><button className="rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background" onClick={() => setAlertsOpen(true)}>Create a custom alert</button></>}
          {tool === "Scenario lab" && <FundamentalsInsights symbol={symbol} currency={data.currency} />}
          <div className="flex gap-4 border-t border-border/70 pt-4 text-xs font-semibold text-primary"><Link to={`/stock/${encodeURIComponent(symbol)}`}>Open stock Fundamentals →</Link><Link to={`/compare?stock=${encodeURIComponent(symbol)}`}>Compare peers →</Link></div>
        </div>}
      </>}
    </main>
    {paid && <StockAlertDialog open={alertsOpen} onOpenChange={setAlertsOpen} symbol={symbol} currentPrice={data?.quote?.lastPrice ?? 0} />}
  </div>;
}

function Briefing({ data }: { data: EngineBundle }) {
  return <section className="space-y-6"><div><h3 className="text-lg font-semibold">Fundamental briefing</h3><p className="mt-1 text-xs text-muted-foreground">{data.briefing.coverage}</p><div className="mt-3 divide-y divide-border/70">{data.briefing.facts.map(fact => <p key={fact} className="py-3 text-sm leading-relaxed">{fact}</p>)}</div>{!data.briefing.facts.length && <p className="py-4 text-sm text-muted-foreground">There are not enough reported financial inputs for a company briefing yet.</p>}</div><div className="grid gap-6 sm:grid-cols-2">{[["Supporting evidence", data.briefing.strengths], ["Risks to examine", data.briefing.risks]].map(([label, entries]) => <div key={label as string}><h4 className="text-sm font-semibold">{label as string}</h4>{(entries as string[]).length ? (entries as string[]).map(item => <p className="mt-2 text-sm text-muted-foreground" key={item}>{item}</p>) : <p className="mt-2 text-sm text-muted-foreground">No additional signal from the available inputs.</p>}</div>)}</div><p className="text-xs text-muted-foreground">{data.briefing.methodology}</p><div className="grid grid-cols-2 gap-4 border-t border-border/70 pt-4 text-xs text-muted-foreground"><p>Annual periods <strong className="block text-lg text-foreground">{data.coverage.annualPeriods}</strong></p><p>Valuation models <strong className="block text-lg text-foreground">{data.coverage.valuationModels}</strong></p><p>Earnings records <strong className="block text-lg text-foreground">{data.coverage.earningsEvents}</strong></p><p>Analyst estimates <strong className="block text-lg text-foreground">{data.coverage.analystEstimates}</strong></p></div></section>;
}
