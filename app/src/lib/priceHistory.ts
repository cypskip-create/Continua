export interface PriceObservation {
    timestamp?: string; date?: string; close: number;
    open?: number | null; high?: number | null; low?: number | null; volume?: number | null;
    sourceUrl?: string; adjustment?: string; basis?: string;
}
export interface ChartPoint {
    date: string; price: number; close: number; timestamp: number; up: boolean;
    open?: number; high?: number; low?: number; volume?: number;
    body?: [number, number]; wickRange?: [number, number]; sourceUrl?: string;
}
const day = 86_400_000;
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
export function priceWindow(timeframe: string, now = new Date()) {
    const end = new Date(now); end.setUTCHours(23, 59, 59, 999);
    const days = ({'1W': 7, '1M': 30, '3M': 90, '1Y': 365} as Record<string, number>)[timeframe];
    const start = timeframe === 'YTD' ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
        : timeframe === 'ALL' ? new Date('2015-01-01T00:00:00Z') : new Date(end.getTime() - (days ?? 0) * day);
    return {from: start.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10)};
}
/** Exact observed closes only. Conflicting same-day sources are withheld. */
export function normalizePriceHistory(candles: PriceObservation[], closes: PriceObservation[], timeframe: string, now = new Date()): ChartPoint[] {
    const {from, to} = priceWindow(timeframe, now), selected = new Map<string, PriceObservation>(), conflicts = new Set<string>();
    for (const row of closes) {
        const key = (row.date ?? row.timestamp ?? '').slice(0, 10);
        if (selected.has(key) && selected.get(key)!.close !== row.close) conflicts.add(key);
        else selected.set(key, row);
    }
    for (const key of conflicts) selected.delete(key);
    for (const row of candles) {
        const key = (row.timestamp ?? row.date ?? '').slice(0, 10);
        const complete = positive(row.open) && positive(row.high) && positive(row.low) && positive(row.close)
            && row.high >= Math.max(row.open, row.close, row.low) && row.low <= Math.min(row.open, row.close);
        if (complete) selected.set(key, row);
    }
    return [...selected].filter(([key, row]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= from && key <= to && positive(row.close)
        && Number.isFinite(Date.parse(key)) && new Date(key).toISOString().slice(0, 10) === key)
        .sort(([a], [b]) => a.localeCompare(b)).map(([key, row]) => {
            const ohlc = positive(row.open) && positive(row.high) && positive(row.low) && row.high >= Math.max(row.open, row.close, row.low) && row.low <= Math.min(row.open, row.close);
            return {date: key, timestamp: Date.parse(key + 'T00:00:00Z'), price: row.close, close: row.close,
                open: ohlc ? row.open! : undefined, high: ohlc ? row.high! : undefined, low: ohlc ? row.low! : undefined,
                body: ohlc ? [Math.min(row.open!, row.close), Math.max(row.open!, row.close)] as [number, number] : undefined,
                wickRange: ohlc ? [row.low!, row.high!] as [number, number] : undefined, up: ohlc ? row.close >= row.open! : false,
                volume: typeof row.volume === 'number' && Number.isFinite(row.volume) && row.volume >= 0 ? row.volume : undefined,
                sourceUrl: row.sourceUrl};
        });
}
export function chartCoverage(points: ChartPoint[], timeframe: string, chartType: string, now = new Date()) {
    if (timeframe === '1D') return {available: false, reason: 'Verified intraday observations are not available. A quote is not an intraday price series.'};
    if (points.length < 2) return {available: false, reason: 'At least two distinct dated price observations are required.'};
    if (chartType === 'candle' && points.some(p => p.open == null || p.high == null || p.low == null))
        return {available: false, reason: 'Only closing prices are available. Candlesticks require reported open, high and low values. Your chart-type choice is retained.'};
    if (timeframe !== 'ALL') {
        const {from, to} = priceWindow(timeframe, now), start = Date.parse(from), end = Date.parse(to), span = Math.max(1, (end - start) / day);
        const tolerance = Math.min(7, Math.max(3, span * .1));
        const enough = points.length >= Math.max(2, Math.floor(span * 5 / 7 * .6));
        const gaps = points.some((p, i) => i > 0 && p.timestamp - points[i - 1].timestamp > 10 * day);
        if (!enough || points[0].timestamp > start + tolerance * day || points.at(-1)!.timestamp < end - 7 * day || gaps)
            return {available: false, reason: `Historical prices are not current enough for ${timeframe}. Last available close: ${points.at(-1)!.date}.`};
    }
    return {available: true, reason: `${points.length} observed prices · ${points[0].date} to ${points.at(-1)!.date}. No missing dates or OHLC values are generated.`};
}
