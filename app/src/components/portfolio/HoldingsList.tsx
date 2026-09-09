import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Trash2 } from "lucide-react";
import { getDivYield } from "@/lib/stockPrices";
import { useLiveQuotes } from "@/hooks/useLiveQuotes";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface HoldingInput {
  id?: string;
  symbol: string;
  name: string;
  shares: number;
  avg_cost: number;
  sector?: string | null;
}

interface Props {
  holdings: HoldingInput[];
  /** Hide KES amounts (percentages stay visible). */
  showValues?: boolean;
  /** Hide profit/loss entirely (public-profile privacy option). */
  showGains?: boolean;
  onRemove?: (id: string) => void;
}

const kes = (n: number, dp = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/**
 * Institutional holdings table — one dense row per position, expandable into a
 * full cost-basis / P&L / income breakdown. Flat on the page canvas, hairline
 * separated, tabular numerics throughout.
 */
export function HoldingsList({ holdings, showValues = true, showGains = true, onRemove }: Props) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);

  // Live Continua Data Layer quotes — the SAME quotes Watchlist, Markets
  // and the Stock Page read, so a position's value here can never disagree
  // with what those surfaces show for the same symbol. A holding with no
  // live quote yet renders a loading skeleton for its value/return
  // columns instead of a fabricated price — cost basis is always known
  // and shown regardless.
  const symbols = useMemo(() => holdings.map(h => h.symbol), [holdings]);
  const { quotes } = useLiveQuotes(symbols);

  const rows = holdings.map((h) => {
    const quote = quotes[h.symbol.toUpperCase()];
    const cost = h.avg_cost * h.shares;
    const divYield = getDivYield(h.symbol);
    if (!quote) {
      return {
        ...h, isLive: false as const, price: null, value: null, cost, gain: null, gainPct: null,
        day: null, dayValue: null, divYield, income: null,
      };
    }
    const price = quote.lastPrice;
    const value = price * h.shares;
    const gain = value - cost;
    const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
    const day = { abs: quote.change, pct: quote.changePercent };
    const dayValue = day.abs * h.shares;
    const income = (divYield / 100) * value;
    return { ...h, isLive: true as const, price, value, cost, gain, gainPct, day, dayValue, divYield, income };
  });

  const total = rows.reduce((s, r) => s + (r.value ?? 0), 0);

  return (
    <div>
      {/* Column headers */}
      <div className="grid grid-cols-12 gap-2 pb-2 hairline text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        <span className="col-span-5">Position</span>
        <span className="col-span-3 text-right">Market value</span>
        <span className="col-span-4 text-right">Total return</span>
      </div>

      <div>
        {rows.map((r) => {
          const key = r.id || r.symbol;
          const isOpen = expanded === key;
          const weight = total > 0 ? (r.value / total) * 100 : 0;
          return (
            <div key={key} className="border-b border-border/50 last:border-0">
              <button
                data-small-target
                onClick={() => setExpanded(isOpen ? null : key)}
                className="w-full grid grid-cols-12 gap-2 items-center py-3 text-left active:bg-muted/20 transition-colors"
              >
                <div className="col-span-5 flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold shrink-0">
                    {r.symbol.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-[13px] font-semibold truncate">{r.symbol}</p>
                      <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {r.shares} sh · avg {kes(r.avg_cost)}
                    </p>
                  </div>
                </div>

                <div className="col-span-3 text-right">
                  {r.isLive ? (
                    <>
                      <p className="text-[13px] font-semibold tabular">{showValues ? kes(r.value, 0) : "••••"}</p>
                      <p className={cn("text-[10px] tabular", r.day.pct >= 0 ? "text-bull" : "text-bear")}>
                        {r.day.pct >= 0 ? "+" : ""}{r.day.pct.toFixed(2)}% today
                      </p>
                    </>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-3 w-14" />
                    </div>
                  )}
                </div>

                <div className="col-span-4 text-right">
                  {!r.isLive ? (
                    <div className="flex flex-col items-end gap-1">
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ) : showGains ? (
                    <>
                      <p className={cn("text-[13px] font-semibold tabular", r.gain >= 0 ? "text-bull" : "text-bear")}>
                        {r.gain >= 0 ? "+" : ""}{r.gainPct.toFixed(2)}%
                      </p>
                      <p className={cn("text-[10px] tabular", r.gain >= 0 ? "text-bull" : "text-bear")}>
                        {showValues ? `${r.gain >= 0 ? "+" : "−"}KES ${kes(Math.abs(r.gain), 0)}` : "••••"}
                      </p>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Hidden</p>
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="pb-4 animate-fade-in">
                  <div className="grid grid-cols-3 gap-y-3 gap-x-2 hairline-t pt-3">
                    <Metric label="Last price" value={r.price != null ? kes(r.price) : "—"} />
                    <Metric label="Avg price" value={kes(r.avg_cost)} />
                    <Metric label="Shares" value={String(r.shares)} />
                    <Metric label="Cost basis" value={showValues ? kes(r.cost, 0) : "••••"} />
                    <Metric
                      label="Day P/L"
                      value={r.dayValue != null ? (showValues ? `${r.dayValue >= 0 ? "+" : "−"}${kes(Math.abs(r.dayValue), 0)}` : "••••") : "—"}
                      tone={r.dayValue != null ? (r.dayValue >= 0 ? "bull" : "bear") : undefined}
                    />
                    <Metric
                      label="Unrealised P/L"
                      value={showGains ? (r.gain != null ? (showValues ? `${r.gain >= 0 ? "+" : "−"}${kes(Math.abs(r.gain), 0)}` : "••••") : "—") : "—"}
                      tone={r.gain != null ? (r.gain >= 0 ? "bull" : "bear") : undefined}
                    />
                    <Metric label="Portfolio weight" value={r.value != null ? `${weight.toFixed(1)}%` : "—"} />
                    <Metric label="Div. yield" value={r.divYield > 0 ? `${r.divYield.toFixed(1)}%` : "—"} />
                    <Metric label="Est. income / yr" value={r.income != null && r.divYield > 0 && showValues ? kes(r.income, 0) : "—"} />
                  </div>

                  <div className="mt-3 h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-foreground/70" style={{ width: `${Math.min(100, weight)}%` }} />
                  </div>

                  <div className="mt-3 flex items-center gap-4">
                    <button
                      data-small-target
                      className="text-[11px] font-semibold text-primary"
                      onClick={() => navigate(`/stock/${r.symbol}`)}
                    >
                      Open {r.symbol} research
                    </button>
                    {onRemove && r.id && (
                      <button
                        data-small-target
                        className="text-[11px] font-semibold text-destructive inline-flex items-center gap-1"
                        onClick={() => onRemove(r.id!)}
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div>
      <p className="text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className={cn("text-[12px] font-semibold tabular mt-0.5", tone === "bull" && "text-bull", tone === "bear" && "text-bear")}>
        {value}
      </p>
    </div>
  );
}