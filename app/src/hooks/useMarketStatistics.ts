import {useQuery} from '@tanstack/react-query';
import {continuaFetch} from '@/api/client';
export interface MarketStatistics {
    marketCap: number | null; marketCapBasis: string; pe: number | null; eps: number | null;
    volume: number | null; high52: number | null; low52: number | null; rangeBasis: string;
    priceAsOf: string | null; financialYear: number | null; financialPeriodEnd: string | null;
    filingDate: string | null; financialBasis: string; sourceUrls: string[]; sharesAsOf: string | null;
    rangeCoverage: {observations: number; from: string | null; to: string | null; complete: boolean}; methodology: string;
}
export function useMarketStatistics(symbol: string) {
    return useQuery({queryKey: ['continua', 'market-statistics-v1', symbol],
        queryFn: () => continuaFetch<MarketStatistics>(`/statistics/${encodeURIComponent(symbol)}`, {params: {exchange: 'NSE'}}),
        enabled: !!symbol, staleTime: 60000, refetchInterval: 60000, retry: 1});
}
