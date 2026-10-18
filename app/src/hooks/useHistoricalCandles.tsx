import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import {historicalApi} from '@/api/historicalApi';
import {normalizePriceHistory, priceWindow} from '@/lib/priceHistory';
export type {ChartPoint} from '@/lib/priceHistory';

/** Genuine OHLC and explicitly close-only observations; never generated bars. */
export function useHistoricalCandles(symbol: string | undefined, timeframe: string) {
    const isSupported = timeframe !== '1D' && !!symbol;
    const window = useMemo(() => priceWindow(timeframe), [timeframe]);
    const query = useQuery({
        queryKey: ['continua', 'observed-price-history-v2', symbol, timeframe, window.from, window.to],
        queryFn: async () => {
            const results = await Promise.allSettled([
                historicalApi.getCandles(symbol!, {interval: '1d', from: window.from, to: window.to + 'T23:59:59.999Z'}),
                historicalApi.getCloses(symbol!, window),
            ]);
            if (results.every(r => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason;
            return normalizePriceHistory(results[0].status === 'fulfilled' ? results[0].value : [], results[1].status === 'fulfilled' ? results[1].value : [], timeframe);
        },
        enabled: isSupported, staleTime: 5 * 60_000, refetchInterval: 5 * 60_000, retry: 1,
    });
    return {points: query.data ?? [], isLoading: isSupported && query.isLoading, isSupported, isError: query.isError};
}
