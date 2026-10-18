export const CHART_TIMEFRAMES = ['1D', '1W', '1M', '3M', 'YTD', '1Y', 'ALL'] as const;
export type ChartTimeframe = typeof CHART_TIMEFRAMES[number];
export type PriceChartType = 'line' | 'area' | 'candle';
export interface ChartPreferences {timeframe: ChartTimeframe; chartType: PriceChartType}
const key = 'continua:price-chart:v1';
const defaults: ChartPreferences = {timeframe: '1D', chartType: 'line'};
let current = {...defaults};
let memoryOnly = false;
export function loadChartPreferences(): ChartPreferences {
    if (memoryOnly) return {...current};
    try {
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
        if (raw) {
            const value = JSON.parse(raw);
            current = {
                timeframe: CHART_TIMEFRAMES.includes(value?.timeframe) ? value.timeframe : defaults.timeframe,
                chartType: ['line', 'area', 'candle'].includes(value?.chartType) ? value.chartType : defaults.chartType,
            };
        }
    } catch { /* In-memory preferences still survive navigation when storage is denied. */ }
    return {...current};
}
export function saveChartPreferences(update: Partial<ChartPreferences>): ChartPreferences {
    current = {...loadChartPreferences(), ...update};
    try {window.localStorage.setItem(key, JSON.stringify(current)); memoryOnly = false;} catch {memoryOnly = true;}
    return {...current};
}
