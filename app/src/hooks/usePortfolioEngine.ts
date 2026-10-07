import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { engineReadRetry } from "@/api/engineRetry";
import { useAuth } from "./useAuth";
import { useExchange } from "./useExchange";
import { usePortfolio } from "./usePortfolio";
import { useLivePortfolioQuotes } from "./useLiveQuotes";
import { usePortfolioValuations } from "./usePortfolioValuations";
import { usePortfolioDividends } from "./usePortfolioDividends";
import { usePortfolioResearch } from "./usePortfolioResearch";
import { usePortfolioUpdates } from "./usePortfolioUpdates";
import { usePortfolioGrowth } from "./usePortfolioGrowth";
import { useMarketBenchmark } from "./useMarketBenchmark";
import { computePortfolioStats } from "@/lib/stockPrices";
import { engineWorkspaceApi } from "@/api/engineWorkspaceApi";

/** One portfolio coordinator preserves existing free feeds and gates advanced research. */
export function usePortfolioEngine(isPremium: boolean, analysisOpen: boolean) {
  const portfolio = usePortfolio(), { user } = useAuth(), { exchange } = useExchange();
  const symbols = portfolio.portfolio.map(h => h.symbol);
  const { liveQuotes } = useLivePortfolioQuotes(symbols);
  const pricedSymbols = symbols.filter(symbol => liveQuotes[symbol.toUpperCase()]?.price > 0);
  const stats = useMemo(() => computePortfolioStats(portfolio.portfolio, liveQuotes), [portfolio.portfolio, liveQuotes]);
  const valuations = usePortfolioValuations(pricedSymbols);
  const dividends = usePortfolioDividends(pricedSymbols);
  const research = usePortfolioResearch(pricedSymbols);
  const updates = usePortfolioUpdates(symbols);
  const growth = usePortfolioGrowth(isPremium && analysisOpen ? pricedSymbols : []);
  const benchmark = useMarketBenchmark();
  const overview = useQuery({
    queryKey: ["continua", "engine-portfolio-overview", user?.id, exchange],
    queryFn: () => engineWorkspaceApi.portfolioOverview(exchange), enabled: !!user,
    staleTime: 60_000, retry: engineReadRetry,
  });
  const intelligence = useQuery({
    queryKey: ["continua", "engine-portfolio", user?.id, exchange],
    queryFn: () => engineWorkspaceApi.portfolio(exchange),
    enabled: !!user && isPremium && analysisOpen && symbols.length > 0,
    staleTime: 60_000, retry: engineReadRetry,
  });
  return { ...portfolio, exchange, liveQuotes, stats, valuations, dividends, research, updates, growth, benchmark, overview, intelligence };
}
