import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/storage/db.js', () => ({ query: vi.fn() }));
import { query } from '../src/storage/db.js';
import { scoresRepository } from '../src/storage/repositories/scoresRepository.js';
import { computeRatios } from '../src/services/research/ratiosEngine.js';
beforeEach(() => vi.resetAllMocks());
it('keeps core ratios writable before the additive PS migration', async () => {
  vi.mocked(query).mockRejectedValueOnce({ code: '42703', message: 'column "ps" does not exist' }).mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
  await scoresRepository.upsertRatios({ securityId: 'NSE:KCB', asOf: '2026-10-03', pe: 10, ps: 2 });
  expect(query).toHaveBeenCalledTimes(2);
  expect(vi.mocked(query).mock.calls[1]![1]).toHaveLength(18);
});
it('does not hide connection or unrelated database errors', async () => {
  vi.mocked(query).mockRejectedValueOnce(new Error('connection unavailable'));
  await expect(scoresRepository.upsertRatios({ securityId: 'NSE:KCB', asOf: '2026-10-03' })).rejects.toThrow('connection unavailable');
  expect(query).toHaveBeenCalledTimes(1);
});
it('subtracts cash in enterprise value and never returns infinite ratios', () => {
  const ratios = computeRatios({ price: 10, sharesOutstanding: 100, totalDebt: 200, cash: 300, ebitda: 100, netIncome: 0, revenue: 100, totalEquity: 0, totalAssets: 200, priceHistory90d: [0, 10, 12] });
  expect(ratios.evEbitda).toBe(9);
  expect(ratios.pe).toBeUndefined();
  expect(ratios.roe).toBeUndefined();
  expect(ratios.volatility90d).toBeUndefined();
});
