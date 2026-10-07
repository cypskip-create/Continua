import { useEnginePreferences } from "@/hooks/useEnginePreferences";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useWatchlist } from "@/hooks/useWatchlist";
const goals = ["Balanced", "Income", "Growth", "Capital preservation", "Short-term trading"] as const;
export function EngineFocus({ onGoalChange }: { onGoalChange?: (goal: string) => void }) {
  const { user } = useAuth();
  const { portfolio } = usePortfolio();
  const { watchlist } = useWatchlist();
  return <Focus key={user?.id ?? "guest"} onGoalChange={onGoalChange} account={user?.id ?? "guest"} symbols={[...new Set([...portfolio.map(p => p.symbol), ...watchlist.map(p => p.symbol)])]} />;
}
function Focus({ account, symbols, onGoalChange }: { account: string; symbols: string[]; onGoalChange?: (goal: string) => void }) {
  const {settings, query, save, enabled} = useEnginePreferences();
  const key = "engine-focus:" + account;
  const [goal, setGoal] = useState<string>(() => { try { const saved = localStorage.getItem(key); return goals.includes(saved as typeof goals[number]) ? saved! : "Balanced"; } catch { return "Balanced"; } });
  const activeGoal=query.data?.goal??goal;
  useEffect(() => { onGoalChange?.(activeGoal); }, [activeGoal, onGoalChange]);
  const guidance: Record<string, string> = { Balanced: "Review valuation, profitability and portfolio concentration together.", Income: "Start with dividend history, coverage and cash flow sustainability.", Growth: "Compare consecutive-year revenue, earnings and valuation assumptions.", "Capital preservation": "Examine debt, losses, data gaps and concentration before potential upside.", "Short-term trading": "Check dated technical signals, liquidity and price alerts alongside company news." };
  return <section className="border-y border-border/70 py-4 space-y-3" aria-label="Engine research focus"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Your research focus</h2><label className="text-xs">Goal <select aria-label="Research goal" className="ml-2 rounded border border-border bg-background p-2" value={activeGoal} disabled={save.isPending || (enabled && query.isLoading)} onChange={e => { setGoal(e.target.value); if(enabled && query.data) save.mutate({...settings,goal:e.target.value}); try { localStorage.setItem(key, e.target.value); } catch {} }}>{goals.map(g => <option key={g}>{g}</option>)}</select></label></div><p className="text-sm text-muted-foreground">{guidance[activeGoal]}</p><p className="text-xs text-muted-foreground">{query.data ? "Preferences synced to your account." : "Saved on this device; account sync is unavailable."} Holdings and watchlist guide your research universe; they do not establish your risk tolerance.</p><div className="flex flex-wrap gap-2">{symbols.slice(0, 6).map(symbol => <Link key={symbol} to={"/engine?symbol=" + encodeURIComponent(symbol)} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold">{symbol}</Link>)}<Link to="/engine" className="text-xs font-semibold text-primary py-1.5">Explore Engine →</Link></div></section>;
}
