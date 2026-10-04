import { it, expect } from 'vitest';
import { trailingDividendPerShare } from '../src/services/research/dividendMetrics.js';
import type { CorporateAction } from '../src/types/market.js';
const dividend = (exDate: string, amount: number, status: CorporateAction['status'] = 'completed'): CorporateAction => ({ id: exDate, securityId: 'NSE:KCB', type: 'dividend', announcedAt: exDate, exDate, status, details: { type: 'dividend', amountPerShare: amount, currency: 'KES', dividendType: 'final' } });
it('counts the trailing date window, excluding cancelled and future payments', () => {
  expect(trailingDividendPerShare([dividend('2023-04-01', 20), dividend('2025-11-01', 2), dividend('2026-04-01', 3), dividend('2026-05-01', 7, 'cancelled'), dividend('2026-12-01', 9)], new Date('2026-10-03'))).toBe(5);
});
it('does not invent a zero yield for missing coverage', () => {
  expect(trailingDividendPerShare([], new Date('2026-10-03'))).toBeUndefined();
});
