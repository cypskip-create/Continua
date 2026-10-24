import {useMemo} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {observedHistory} from '@/api/observedHistory';
import {priceWindow} from '@/lib/priceHistory';
export type {ChartPoint} from '@/lib/priceHistory';

/** Genuine OHLC and explicitly close-only observations; never generated bars. */
export function useHistoricalCandles(symbol: string | undefined, timeframe: string) {
    const client = useQueryClient();
    const isSupported = timeframe !== '1D' && !!symbol;
    const window = useMemo(() => priceWindow(timeframe), [timeframe]);
    const query = useQuery({
        queryKey: ['continua', 'observed-price-history-v2', symbol, timeframe, window.from, window.to],
        queryFn: () => observedHistory(symbol!,timeframe),
        placeholderData: () => client.getQueryCache().findAll({queryKey: ['continua', 'observed-price-history-v2', symbol, timeframe]})
          .filter(query => Date.now() - query.state.dataUpdatedAt < 86_400_000)
          .sort((a,b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)[0]?.state.data as Awaited<ReturnType<typeof observedHistory>> | undefined,
        enabled: isSupported, staleTime: 5 * 60_000, refetchInterval: 5 * 60_000, retry: 1,
    });
    return {points: query.data ?? [], isLoading: isSupported && query.isLoading, isSupported, isError: query.isError};
}
