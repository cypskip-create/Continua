import { useQueries } from "@tanstack/react-query";
import { corporateActionsApi } from "@/api/corporateActionsApi";
import type { CorporateAction } from "@/api/types";
import { dividendWindows } from "@/lib/dividendWindows";

export interface DividendPayout {
  amountPerShare: number;
  exDate: string | null;
  payDate: string | null;
  dividendType: string;
  estimated?: boolean;
}

export interface HoldingDividendData {
  symbol: string;
  payouts: DividendPayout[];       // real, most-recent-first
  ttmPerShare: number;             // recorded ex-dividends in the last calendar year
  priorTtmPerShare: number | null; // recorded ex-dividends in the preceding calendar year
  growthPct: number | null;        // ttm vs priorTtm, null if not enough history
  avgIntervalDays: number | null;  // median gap between consecutive ex-dates
  lastExDate: string | null;
  monthsSinceLastPay: number | null;
  /** Projected next 1–2 events, purely mechanical (last amount, last cadence) —
   *  never a growth guess. Marked `estimated: true` so callers can render
   *  the "(Est.)" convention used elsewhere in the app. */
  projected: DividendPayout[];
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function toDividendPayout(action: CorporateAction): DividendPayout | null {
  const details = action.details as { amountPerShare?: number; dividendType?: string };
  if (!details?.amountPerShare) return null;
  return {
    amountPerShare: details.amountPerShare,
    exDate: action.exDate ?? null,
    payDate: action.payDate ?? null,
    dividendType: details.dividendType ?? "final",
  };
}

function analyze(symbol: string, actions: CorporateAction[]): HoldingDividendData {
  const payouts = actions
    .filter((action) => action.type === "dividend" && action.status !== "cancelled")
    .map(toDividendPayout)
    .filter((p): p is DividendPayout => !!p && !!p.exDate)
    .sort((a, b) => new Date(b.exDate as string).getTime() - new Date(a.exDate as string).getTime());

  const { ttm: ttmPerShare, prior: priorTtmPerShare, growth: growthPct } = dividendWindows(payouts);

  const gaps: number[] = [];
  for (let i = 0; i < payouts.length - 1; i++) {
    const a = new Date(payouts[i].exDate as string).getTime();
    const b = new Date(payouts[i + 1].exDate as string).getTime();
    gaps.push(Math.round((a - b) / 86_400_000));
  }
  const avgIntervalDays = median(gaps);
  const lastExDate = payouts[0]?.exDate ?? null;
  const monthsSinceLastPay = lastExDate
    ? (Date.now() - new Date(lastExDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    : null;

  // Mechanically project forward using the last real amount and the
  // observed cadence — no assumed growth. If we don't have at least one
  // real payout and an interval to project from, we project nothing
  // rather than invent a schedule.
  const projected: DividendPayout[] = [];
  if (payouts.length > 0 && avgIntervalDays && avgIntervalDays > 0 && lastExDate) {
    const horizon = Date.now() + 24 * 30.44 * 86_400_000; // ~24 months out
    let cursor = new Date(lastExDate).getTime();
    let guard = 0;
    while (cursor < horizon && guard < 30) {
      guard++;
      cursor += avgIntervalDays * 86_400_000;
      if (cursor < Date.now() - 86_400_000 * 3) continue; // don't project into the past
      const exDate = new Date(cursor).toISOString();
      const payDate = new Date(cursor + 30 * 86_400_000).toISOString();
      projected.push({
        amountPerShare: payouts[0].amountPerShare,
        exDate,
        payDate,
        dividendType: payouts[0].dividendType,
        estimated: true,
      });
    }
  }

  return { symbol, payouts, ttmPerShare, priorTtmPerShare, growthPct, avgIntervalDays, lastExDate, monthsSinceLastPay, projected };
}

/** Real dividend corporate-action history for every symbol in the
 *  portfolio, fetched in parallel and reduced into the trailing-12m
 *  actuals, growth, and cadence each holding needs for the Dividends tab
 *  (quality score, calendar, forecast). See useDividendHistory.tsx for
 *  the single-symbol equivalent this generalizes. */
export function usePortfolioDividends(symbols: string[]) {
  const uniqueSymbols = [...new Set(symbols.map((s) => s.toUpperCase()))];

  const results = useQueries({
    queries: uniqueSymbols.map((symbol) => ({
      queryKey: ["continua", "dividends", symbol],
      queryFn: () => corporateActionsApi.getDividends(symbol),
      staleTime: 5 * 60_000,
      retry: 1,
    })),
  });

  const bySymbol: Record<string, HoldingDividendData> = {};
  uniqueSymbols.forEach((symbol, i) => {
    bySymbol[symbol] = analyze(symbol, results[i]?.data ?? []);
  });

  return { data: bySymbol, isLoading: results.some((r) => r.isLoading) };
}
