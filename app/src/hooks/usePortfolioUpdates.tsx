import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { financialsApi } from "@/api/financialsApi";
import { newsApi } from "@/api/newsApi";
import { usePortfolioDividends } from "./usePortfolioDividends";

export type UpdateCategory = "earnings" | "dividends" | "filings";

export interface PortfolioUpdateItem {
  id: string;
  symbol: string;
  category: UpdateCategory;
  title: string;
  detail: string | null;
  date: string; // ISO
  url: string | null;
  needsReview?: boolean; // filings only — low-confidence entity match
}

const RECENT_DAYS = 120;
const isRecent = (iso: string | null | undefined) =>
  !!iso && Number.isFinite(Date.parse(iso)) && Date.now() - Date.parse(iso) >= -86_400_000 && Date.now() - Date.parse(iso) <= RECENT_DAYS * 86_400_000;

/** Real, dated updates for every holding in the portfolio, pulled from
 *  three independent structured sources and merged newest-first:
 *   · Earnings   — latest reported fiscal period (financialsApi)
 *   · Dividends  — real payouts on record (reuses usePortfolioDividends)
 *   · News       — publisher headlines linked to each holding, with a
 *                  short excerpt and explainable topic context. Corporate
 *                  landing pages and undated filings are not news updates.
 */
export function usePortfolioUpdates(symbols: string[]) {
  // Stabilize the symbol list by content, not array identity, so the
  // memo below and the useQueries arrays don't rebuild every render.
  const symbolsKey = [...new Set(symbols.filter(Boolean).map((s) => s.toUpperCase()))].sort().join(",");
  const uniqueSymbols = useMemo(() => (symbolsKey ? symbolsKey.split(",") : []), [symbolsKey]);
  const { data: dividendData, isLoading: dividendsLoading } = usePortfolioDividends(uniqueSymbols);

  const earningsResults = useQueries({
    queries: uniqueSymbols.map((symbol) => ({
      queryKey: ["continua", "financials-latest", symbol],
      queryFn: () => financialsApi.getLatest(symbol),
      staleTime: 30 * 60_000,
      retry: 1,
    })),
  });

  const filingsResults = useQueries({
    queries: uniqueSymbols.map((symbol) => ({
      queryKey: ["continua", "news", "symbol", symbol],
      queryFn: () => newsApi.getForSymbol(symbol, { limit: 20 }),
      staleTime: 60_000,
      refetchInterval: 60_000,
      retry: 1,
    })),
  });

  const items = useMemo(() => {
    const list: PortfolioUpdateItem[] = [];

    uniqueSymbols.forEach((symbol, i) => {
      const bundle = earningsResults[i]?.data;
      if (bundle?.reportedAt) {
        const periodLabel = bundle.fiscalQuarter
          ? `Q${bundle.fiscalQuarter} ${bundle.fiscalYear}`
          : `FY${bundle.fiscalYear}`;
        list.push({
          id: `earnings-${symbol}-${bundle.periodId}`,
          symbol,
          category: "earnings",
          title: `${periodLabel} earnings released`,
          detail: `EPS ${bundle.eps.toFixed(2)} · Revenue ${bundle.revenue.toLocaleString("en-US", { maximumFractionDigits: 0 })} · Net income ${bundle.netIncome.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
          date: bundle.reportedAt,
          url: null,
        });
      }
    });

    Object.values(dividendData).forEach((d) => {
      d.payouts.slice(0, 3).forEach((p) => {
        if (!p.exDate) return;
        list.push({
          id: `dividend-${d.symbol}-${p.exDate}`,
          symbol: d.symbol,
          category: "dividends",
          title: `${p.dividendType === "special" ? "Special dividend" : "Dividend"} declared`,
          detail: `${p.amountPerShare.toFixed(2)} per share · Ex-date ${new Date(p.exDate).toLocaleDateString()}`,
          date: p.exDate,
          url: null,
        });
      });
    });

    uniqueSymbols.forEach((symbol, i) => {
      (filingsResults[i]?.data ?? []).filter(a => isRecent(a.publishedAt)).forEach((a) => {
        list.push({
          id: `filing-${a.id}-${symbol}`,
          symbol,
          category: "filings",
          title: a.headline,
          detail: [a.excerpt, a.impact ? `${a.impact.topic}: ${a.impact.reason}` : null].filter(Boolean).join(" · "),
          date: a.publishedAt!,
          url: a.articleUrl,
          needsReview: a.needsReview,
        });
      });
    });

    return list.filter(item => isRecent(item.date)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [uniqueSymbols, earningsResults, dividendData, filingsResults]);

  const recentCounts = useMemo(() => {
    const counts: Record<UpdateCategory, number> = { earnings: 0, dividends: 0, filings: 0 };
    items.forEach((item) => { if (isRecent(item.date)) counts[item.category]++; });
    return counts;
  }, [items]);

  const isLoading = dividendsLoading || earningsResults.some((r) => r.isLoading) || filingsResults.some((r) => r.isLoading);

  return { items, recentCounts, isLoading };
}
