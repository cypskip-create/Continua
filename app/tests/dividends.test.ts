import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dividendWindows } from '../src/lib/dividendWindows.ts';
test('annual and semiannual payments use matching twelve-month windows', () => {
  assert.deepEqual(dividendWindows([
    { exDate: '2023-04-01', amountPerShare: 100 },
    { exDate: '2025-04-01', amountPerShare: 4 },
    { exDate: '2025-11-01', amountPerShare: 3 },
    { exDate: '2026-04-01', amountPerShare: 3 },
    { exDate: '2027-04-01', amountPerShare: 100 },
  ], new Date('2026-10-03')), { ttm: 6, prior: 4, growth: 50 });
});
test('missing earlier payments do not invent dividend growth', () => {
  assert.equal(dividendWindows([], new Date('2026-10-03')).growth, null);
});
