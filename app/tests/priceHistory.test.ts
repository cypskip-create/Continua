import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizePriceHistory, chartCoverage} from '../src/lib/priceHistory.ts';
import {loadChartPreferences, saveChartPreferences} from '../src/lib/chartPreferences.ts';
import {loadIndicatorSettings, saveIndicatorSettings} from '../src/lib/technicalIndicators.ts';
const now = new Date('2026-10-18T12:00:00Z');
test('close-only observations never become OHLC or zero-volume candles', () => {
    const points = normalizePriceHistory([], [{date: '2026-10-15', close: 10}, {date: '2026-10-16', close: 12, volume: 0}], 'ALL', now);
    assert.equal(points.length, 2); assert.equal(points[0].open, undefined); assert.equal(points[0].high, undefined);
    assert.equal(points[0].body, undefined); assert.equal(points[0].volume, undefined); assert.equal(points[1].volume, 0);
    assert.equal(chartCoverage(points, 'ALL', 'candle', now).available, false);
    assert.equal(chartCoverage(points, 'ALL', 'line', now).available, true);
    assert.equal(chartCoverage(points, '3M', 'area', now).available, false);
    assert.equal(chartCoverage(points, '1D', 'line', now).available, false);
});
test('conflicts, invalid dates, nonpositive prices and future rows are withheld; canonical OHLC wins', () => {
    const rows = [{date: '2026-10-15', close: 10}, {date: '2026-10-15', close: 11}, {date: '2026-10-17', close: -1}, {date: '2026-10-19', close: 10}, {date: '2026-02-30', close: 10}];
    assert.equal(normalizePriceHistory([], rows, 'ALL', now).length, 0);
    const [point] = normalizePriceHistory([{timestamp: '2026-10-15T00:00:00Z', open: 9, high: 12, low: 8, close: 10, volume: 100}], rows, 'ALL', now);
    assert.deepEqual(point.body, [9, 10]); assert.equal(point.high, 12); assert.equal(point.volume, 100);
});
test('a real covered three-month series is accepted but a month-long hole is not bridged', () => {
    const rows = Array.from({length: 91}, (_, i) => ({date: new Date(Date.UTC(2026, 6, 20 + i)).toISOString().slice(0, 10), close: 10 + i / 10}));
    const points = normalizePriceHistory([], rows, '3M', now);
    assert.equal(chartCoverage(points, '3M', 'area', now).available, true);
    assert.equal(chartCoverage(points.filter(p => p.date < '2026-08-01' || p.date > '2026-09-01'), '3M', 'line', now).available, false);
});
test('chart type and timeframe persist across issuer navigation and unavailable local storage', () => {
    const stored = new Map<string, string>();
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {configurable: true, value: {localStorage: {getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => stored.set(k, v)}}});
    try {
        saveChartPreferences({timeframe: '3M', chartType: 'area'});
        saveIndicatorSettings({overlays:{ma:true,ema:false,boll:false,sar:true},volume:false,subPanel:'rsi'});
        assert.deepEqual(loadChartPreferences(), {timeframe: '3M', chartType: 'area'});
        assert.equal(loadIndicatorSettings().subPanel,'rsi');
        (globalThis as any).window.localStorage.setItem = () => {throw Error('Denied');};
        saveChartPreferences({chartType: 'line'});
        saveIndicatorSettings({overlays:{ma:true,ema:false,boll:false,sar:true},volume:true,subPanel:'macd'});
        assert.deepEqual(loadChartPreferences(), {timeframe: '3M', chartType: 'line'});
        assert.equal(loadIndicatorSettings().subPanel,'macd');assert.equal(loadIndicatorSettings().volume,true);
        (globalThis as any).window.localStorage.getItem = () => {throw Error('Denied');};
        saveChartPreferences({timeframe:'1Y'});assert.deepEqual(loadChartPreferences(),{timeframe:'1Y',chartType:'line'});
    } finally {if (previous) Object.defineProperty(globalThis, 'window', previous); else delete (globalThis as any).window;}
});
