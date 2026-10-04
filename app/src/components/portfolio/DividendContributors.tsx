import { InfoTip } from "./InfoTip";
import { LockedPreview } from "./LockedPreview";
import type { HoldingDividendData } from "@/hooks/usePortfolioDividends";

interface HoldingLike { symbol: string; name?: string; shares: number }

interface DividendContributorsProps {
  holdings: HoldingLike[];
  dividendData: Record<string, HoldingDividendData>;
  isPremium?: boolean;
  showValues?: boolean;
  currencyLabel?: string;
  freeCount?: number;
}

interface Row { symbol: string; name: string; amount: number }

function ContributorRow({ row, maxAbs, currencyLabel, showValues }: { row: Row; maxAbs: number; currencyLabel: string; showValues: boolean }) {
  const widthPct = Math.max(4, (row.amount / maxAbs) * 100);
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 w-16 shrink-0">
          <p className="text-[0.8125rem] font-bold">{row.symbol}</p>
          <p className="text-[0.625rem] text-muted-foreground truncate">{row.name}</p>
        </div>
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-bull" style={{ width: `${widthPct}%` }} />
        </div>
        <p className="text-[0.8125rem] font-bold tabular shrink-0">
          {showValues ? `${currencyLabel}${row.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "••••"}
        </p>
      </div>
    </div>
  );
}

export function DividendContributors({ holdings, dividendData, isPremium = false, showValues = true, currencyLabel = "KSh", freeCount = 2 }: DividendContributorsProps) {
  const rows: Row[] = holdings
    .map((h) => {
      const d = dividendData[h.symbol.toUpperCase()];
      const amount = (d?.ttmPerShare ?? 0) * h.shares;
      return { symbol: h.symbol, name: h.name || h.symbol, amount };
    })
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  if (rows.length === 0) {
    return (
      <div className="card-gradient rounded-2xl p-4">
        <h3 className="font-serif text-lg flex items-center gap-1.5 mb-1">
          Dividend Contributors (Last 12M)
          <InfoTip>Which holdings drive — or drag — your portfolio's trailing 12-month dividend income, ranked by actual payout on file.</InfoTip>
        </h3>
        <p className="text-[0.6875rem] text-muted-foreground mb-2">
          See which holdings drive — or drag — your portfolio's income.
        </p>
        <p className="text-[0.6875rem] text-muted-foreground py-6 text-center">No confirmed dividend income on file for this portfolio yet.</p>
      </div>
    );
  }

  const maxAbs = Math.max(1, rows[0]?.amount ?? 1);
  const largest = rows.slice(0, freeCount);
  const largestLocked = rows.slice(freeCount);
  const smallestAll = [...rows].reverse();
  const smallest = smallestAll.slice(0, freeCount);
  const smallestLocked = smallestAll.slice(freeCount).filter((r) => !largest.includes(r) && !largestLocked.includes(r));

  return (
    <div className="card-gradient rounded-2xl p-4">
      <h3 className="font-serif text-lg flex items-center gap-1.5 mb-1">
        Dividend Contributors (Last 12M)
        <InfoTip>Which holdings drive — or drag — your portfolio's trailing 12-month dividend income, ranked by actual payout on file.</InfoTip>
      </h3>
      <p className="text-[0.6875rem] text-muted-foreground mb-2">
        See which holdings drive — or drag — your portfolio's income.
      </p>

      <p className="section-eyebrow mt-3 mb-1">Largest Contributors</p>
      <LockedPreview
        unlocked={isPremium || largestLocked.length === 0}
        children={
          <div className="divide-y divide-border/40">
            {largest.map((r) => <ContributorRow key={r.symbol} row={r} maxAbs={maxAbs} currencyLabel={currencyLabel} showValues={showValues} />)}
          </div>
        }
        locked={
          <div className="divide-y divide-border/40">
            {largestLocked.map((r) => <ContributorRow key={r.symbol} row={r} maxAbs={maxAbs} currencyLabel={currencyLabel} showValues={showValues} />)}
          </div>
        }
      />

      {smallest.length > 0 && (
        <>
          <p className="section-eyebrow mt-4 mb-1">Smallest Contributors</p>
          <LockedPreview
            unlocked={isPremium || smallestLocked.length === 0}
            children={
              <div className="divide-y divide-border/40">
                {smallest.map((r) => <ContributorRow key={r.symbol} row={r} maxAbs={maxAbs} currencyLabel={currencyLabel} showValues={showValues} />)}
              </div>
            }
            locked={
              <div className="divide-y divide-border/40">
                {smallestLocked.map((r) => <ContributorRow key={r.symbol} row={r} maxAbs={maxAbs} currencyLabel={currencyLabel} showValues={showValues} />)}
              </div>
            }
          />
        </>
      )}
    </div>
  );
}
