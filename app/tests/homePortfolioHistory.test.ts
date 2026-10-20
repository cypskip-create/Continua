import test from 'node:test';
import assert from 'node:assert/strict';
import { hasHomeHistoryCoverage } from '../src/lib/homePortfolioHistory.js';
const now = Date.UTC(2026, 9, 20);
const history = Array.from({length: 30}, (_, i) => ({timestamp: now - (30 - i) * 86400000, value: 1000 + i}));
test('home chart requires the real requested window, never extrapolates a month into a year', () => {
  assert.equal(hasHomeHistoryCoverage(history, '1M', now), true);
  assert.equal(hasHomeHistoryCoverage(history, '1Y', now), false);
  assert.equal(hasHomeHistoryCoverage(history, '1D', now), false);
  assert.equal(hasHomeHistoryCoverage(history.slice(-2), '1M', now), false);
  assert.equal(hasHomeHistoryCoverage([], 'ALL', now), false);
});
test('home chart rejects stale, future and non-finite observations', () => {
  assert.equal(hasHomeHistoryCoverage(history.map(p => ({...p, timestamp: p.timestamp - 30 * 86400000})), '1M', now), false);
  for (const value of [NaN, Infinity, -1]) assert.equal(hasHomeHistoryCoverage([...history, {timestamp: now, value}], 'ALL', now), false);
  assert.equal(hasHomeHistoryCoverage([...history, {timestamp: now + 1, value: 12}], 'ALL', now), false);
  assert.equal(hasHomeHistoryCoverage(history, 'ALL', now), true);
});
