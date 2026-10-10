import { useEnginePreferences } from "@/hooks/useEnginePreferences";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useWatchlist } from "@/hooks/useWatchlist";
import { Zap, ArrowUpRight, ScanLine, Bell, NotebookPen } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
const goals = ["Balanced", "Income", "Growth", "Capital preservation", "Short-term trading"] as const;
export function EngineFocus({ onGoalChange }: { onGoalChange?: (goal: string) => void }) {
  const { user } = useAuth();
  const { portfolio } = usePortfolio();
  const { watchlist } = useWatchlist();
  return <Focus key={user?.id ?? "guest"} onGoalChange={onGoalChange} account={user?.id ?? "guest"} symbols={[...new Set([...portfolio.map(p => p.symbol), ...watchlist.map(p => p.symbol)])]} />;
}
function Focus({ account, symbols, onGoalChange }: { account: string; symbols: string[]; onGoalChange?: (goal: string) => void }) {
  const {settings, query, save, enabled} = useEnginePreferences();
  const { profile } = useProfile();
  const fullEngine = profile?.subscription_plan === "premium_plus";
  const paid = fullEngine || profile?.subscription_plan === "premium";
  const shortcuts = fullEngine
    ? [["Evidence", "What changed", ScanLine], ["Monitoring", "Monitor", Bell], ["Journal", "My notes", NotebookPen]]
    : [["Forecast", "Forecast", ScanLine], ["Valuation", "Valuation", Zap], ["Evidence", "Evidence", NotebookPen]];
  const key = "engine-focus:" + account;
  const [goal, setGoal] = useState<string>(() => { try { const saved = localStorage.getItem(key); return goals.includes(saved as typeof goals[number]) ? saved! : "Balanced"; } catch { return "Balanced"; } });
  const activeGoal=query.data?.goal??goal;
  useEffect(() => { onGoalChange?.(activeGoal); }, [activeGoal, onGoalChange]);
  const guidance: Record<string, string> = { Balanced: "Review valuation, profitability and portfolio concentration together.", Income: "Start with dividend history, coverage and cash flow sustainability.", Growth: "Compare consecutive-year revenue, earnings and valuation assumptions.", "Capital preservation": "Examine debt, losses, data gaps and concentration before potential upside.", "Short-term trading": "Check dated technical signals, liquidity and price alerts alongside company news." };
  const engineLink = (tool: string) => `/engine?${new URLSearchParams({ tool, ...(symbols[0] ? { symbol: symbols[0] } : {}) })}`;
  return <section className="border-y border-border/70 py-5 space-y-4" aria-label="Engine research focus">
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /><h2 className="text-base font-semibold">Continua Engine</h2><span className="text-[0.625rem] uppercase tracking-wider text-muted-foreground">{fullEngine ? "Premium Plus" : "Premium"}</span></div><Link to="/engine" aria-label="Explore Engine" className="grid h-10 w-10 place-items-center rounded-full hover:bg-muted"><ArrowUpRight className="h-5 w-5" /></Link></div>
    <div><h3 className="text-2xl font-semibold tracking-tight">Make sense of the market.</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{guidance[activeGoal]}</p></div>
    <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">Your research focus<select aria-label="Research goal" className="max-w-[65%] rounded-full border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground" value={activeGoal} disabled={save.isPending || (enabled && query.isLoading)} onChange={e => { setGoal(e.target.value); if(enabled && query.data) save.mutate({...settings,goal:e.target.value}); try { localStorage.setItem(key, e.target.value); } catch {} }}>{goals.map(g => <option key={g}>{g}</option>)}</select></label>
    {paid ? <div className="grid grid-cols-3 divide-x divide-border/70 border-y border-border/70 py-3">{shortcuts.map(([tool, label, Icon]) => { const Glyph = Icon as typeof Zap; return <Link key={tool as string} to={engineLink(tool as string)} className="flex min-h-12 flex-col items-center justify-center gap-2 text-xs font-semibold hover:text-primary"><Glyph className="h-4 w-4 text-primary" />{label as string}</Link>; })}</div> : <Link to="/upgrade" className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background">Explore Premium <ArrowUpRight className="h-4 w-4" /></Link>}
    {!!symbols.length && <div><p className="mb-2 text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">From your holdings & watchlist</p><div className="flex gap-2 overflow-x-auto scrollbar-hide">{symbols.slice(0, 6).map(symbol => <Link key={symbol} to={"/engine?symbol=" + encodeURIComponent(symbol)} className="shrink-0 rounded-full bg-muted/60 px-3 py-2 text-xs font-semibold hover:text-primary">{symbol}</Link>)}</div></div>}
    {save.isError && <p role="status" className="text-xs text-muted-foreground">Account sync unavailable. Your focus is saved on this device.</p>}
  </section>;
}
