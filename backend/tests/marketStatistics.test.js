import {expect, it} from 'vitest';
import {marketStatistics} from '../src/services/marketData/marketStatistics.js';
const now = new Date('2026-10-18T12:00:00Z');
it('uses actual reported shares and EPS without inferring a missing value or date', () => {
    const quote = {lastPrice: 20, volume: 0, currency: 'KES', timestamp: now.toISOString()};
    const history = [{fiscalYear: 2025, periodEnd: '2025-12-31', currency: 'KES', sharesOutstanding: 100, eps: 2, basis: 'publisher_observation'}];
    const result = marketStatistics(quote, history, [], [], now);
    expect(result.marketCap).toBe(2000); expect(result.pe).toBe(10); expect(result.filingDate).toBeNull(); expect(result.volume).toBe(0);
    expect(result.high52).toBeNull(); expect(result.low52).toBeNull();
    const missing = marketStatistics(quote, [{...history[0], eps: null, sharesOutstanding: null}], [], [], now);
    expect(missing.marketCap).toBeNull(); expect(missing.pe).toBeNull();
});
it('a sparse sample never masquerades as a full 52-week range', () => {
    const rows = [{date: '2026-10-15', close: 10}, {date: '2026-10-16', close: 12}];
    expect(marketStatistics(null, [], [], rows, now).high52).toBeNull();
    const covered = Array.from({length: 366}, (_, i) => ({date: new Date(Date.UTC(2025, 9, 18 + i)).toISOString().slice(0, 10), close: 10 + i}));
    const result = marketStatistics(null, [], [], covered, now);
    expect(result.high52).toBe(375); expect(result.low52).toBe(10); expect(result.rangeBasis).toBe('observed_closing_prices');
    expect(marketStatistics(null, [], [], covered.filter(r => r.date < '2026-05-01' || r.date > '2026-06-01'), now).high52).toBeNull();
});
it('future periods and mismatched currencies do not drive current derived metrics', () => {
    const q = {lastPrice: 20, currency: 'KES', timestamp: now.toISOString()};
    const result = marketStatistics(q, [{fiscalYear: 2027, periodEnd: '2027-12-31', eps: 2, sharesOutstanding: 100}, {fiscalYear: 2025, periodEnd: '2025-12-31', currency: 'USD', eps: 2}], [], [], now);
    expect(result.pe).toBeNull(); expect(result.marketCap).toBeNull();
});
