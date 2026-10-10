import { InfoTip } from "./InfoTip";

export interface ContributorRow {
  symbol: string;
  name?: string;
  /** Absolute contribution to portfolio return, in portfolio currency. */
  amount: number;
  /** This holding's own % gain/loss (not weighted). */
  gainPct: number;
}

interface ReturnsContributorsProps {
  holdings: ContributorRow[];
  showValues?: boolean;
  currencyLabel?: string;
  limit?: number;
  onSeeAll?: () => void;
}

export function ReturnsContributors({
  holdings,
  showValues = true,
  currencyLabel = "KSh",
  limit = 3,
  onSeeAll,
}: ReturnsContributorsProps) {
  if (holdings.length === 0) return null;

  const sorted = [...holdings].sort((a, b) => b.amount - a.amount);
  const highest = sorted.slice(0, limit);
  const lowest = [...sorted].reverse().slice(0, limit).filter((h) => !highest.includes(h));

  const maxAbs = Math.max(1, ...holdings.map((h) => Math.abs(h.amount)));

  const Row = ({ h }: { h: ContributorRow }) => {
    const positive = h.amount >= 0;
    const widthPct = Math.max(4, (Math.abs(h.amount) / maxAbs) * 100);
    return (
      <div key={h.symbol} className="py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-bold">{h.symbol}</p>
            <p className="text-[0.65625rem] text-muted-foreground truncate max-w-[140px]">{h.name || h.symbol}</p>
          </div>
          <div className="flex-1 mx-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${positive ? "bg-bull" : "bg-bear"}`}
              style={{ width: `${widthPct}%`, marginLeft: positive ? 0 : `${100 - widthPct}%` }}
            />
          </div>
          <div className="text-right shrink-0">
            <p className={`text-[0.8125rem] font-bold tabular ${positive ? "text-bull" : "text-bear"}`}>
              {showValues ? `${positive ? "" : "−"}${currencyLabel}${Math.abs(h.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "••••"}
            </p>
            <p className={`text-[0.65625rem] tabular ${positive ? "text-bull" : "text-bear"}`}>
              {positive ? "+" : ""}{h.gainPct.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="card-gradient rounded-2xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-serif text-lg flex items-center gap-1.5">
          Contributors to Returns
          <InfoTip>Ranks each holding by its shilling contribution to your total unrealized gain or loss — not by percentage return.</InfoTip>
        </h3>
      </div>

      <div>
        <p className="section-eyebrow mt-3 mb-1">Highest contributors</p>
        <div className="divide-y divide-border/40">
          {highest.map((h) => <Row key={h.symbol} h={h} />)}
        </div>
      </div>

      {lowest.length > 0 && (
        <div>
          <p className="section-eyebrow mt-3 mb-1">Lowest contributors</p>
          <div className="divide-y divide-border/40">
            {lowest.map((h) => <Row key={h.symbol} h={h} />)}
          </div>
        </div>
      )}

      {onSeeAll && holdings.length > limit * 2 && (
        <button
          data-small-target
          onClick={onSeeAll}
          className="w-full mt-3 h-10 rounded-full bg-muted/50 text-[0.75rem] font-semibold text-foreground active:opacity-70 transition-opacity"
        >
          See all {holdings.length} holdings
        </button>
      )}
    </div>
  );
}
