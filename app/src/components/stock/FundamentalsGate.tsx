import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useResearchQuota, type ResearchQuotaResult } from "@/hooks/useResearchQuota";
import { usePageRefresh } from "@/hooks/usePageRefresh";

export function FundamentalsGate({ symbol, children }: { symbol: string; children: ReactNode }) {
  const { user } = useAuth();
  const { recordView } = useResearchQuota();
  const container = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<ResearchQuotaResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [owner, setOwner] = useState<string | null>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setActive(true); observer.disconnect(); }
    }, { rootMargin: "0px", threshold: 0.01 });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!active || !user) return;
    let cancelled = false;
    setResult(null);
    setOwner(null);
    setFailed(false);
    recordView(symbol).then((quota) => {
      if (!cancelled) { setResult(quota); setOwner(user.id); setFailed(!quota); }
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [active, user?.id, symbol, attempt, recordView]);
  usePageRefresh(async () => {
    if (!active || !user) return;
    const quota = await recordView(symbol);
    setResult(quota); setOwner(user.id); setFailed(!quota);
  });
  return <div ref={container} className="min-h-52">
    {result?.allowed && owner === user?.id ? <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 py-3 text-xs">
        <span className="text-muted-foreground">{result.is_premium ? "Premium · unlimited Fundamentals" : `${result.remaining ?? 0} of ${result.limit ?? 5} new stocks left this month · revisit this stock anytime`}</span>
        {!result.is_premium && <Link to="/upgrade" className="font-semibold text-primary">Upgrade</Link>}
      </div>
      {children}
    </> : failed ? <div className="py-10 space-y-3"><p className="text-sm text-muted-foreground">Unable to check your Fundamentals allowance.</p><button className="text-sm font-semibold text-primary" onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : result ? <div className="py-10 space-y-3"><h3 className="text-lg font-semibold">Your monthly Fundamentals allowance is used</h3><p className="text-sm text-muted-foreground">Free includes five different stocks each calendar month. Stocks you already opened remain available. Premium includes unlimited Fundamentals and Continua Engine.</p><Link className="inline-block rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background" to="/upgrade">Explore Premium</Link></div> : <p role="status" className="py-10 text-sm text-muted-foreground">Checking Fundamentals access…</p>}
  </div>;
}
