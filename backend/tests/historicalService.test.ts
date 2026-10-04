import { expect, it, vi } from 'vitest';
vi.mock('../src/storage/repositories/candlesRepository.js', () => ({ candlesRepository: { getCandles: vi.fn() } }));
vi.mock('../src/storage/repositories/securitiesRepository.js', () => ({ securitiesRepository: { getBySymbol: vi.fn().mockResolvedValue({ id: 'NSE:KCB' }) } }));
vi.mock('../src/storage/cache.js', () => ({
  cache: { getOrSet: (_key: string, _ttl: number, read: () => Promise<unknown>) => read() },
  CacheKeys: { candles: () => 'fixture' },
}));
import { candlesRepository } from '../src/storage/repositories/candlesRepository.js';
import { historicalService } from '../src/services/marketData/historicalService.js';

it('serves weekly bars from daily history, never legacy Thursday buckets', async () => {
  vi.mocked(candlesRepository.getCandles).mockResolvedValue([
    { securityId: 'NSE:KCB', interval: '1d', timestamp: '2026-09-28T00:00:00.000Z', open: 10, high: 12, low: 9, close: 11, volume: 100 },
    { securityId: 'NSE:KCB', interval: '1d', timestamp: '2026-10-02T00:00:00.000Z', open: 11, high: 15, low: 10, close: 14, volume: 200 },
  ]);
  const bars = await historicalService.getCandles('NSE', 'KCB', '1w', '2026-09-28', '2026-10-03');
  expect(candlesRepository.getCandles).toHaveBeenCalledWith('NSE:KCB', '1d', '2026-09-28', '2026-10-03');
  expect(bars).toHaveLength(1);
  expect(bars[0]).toMatchObject({ timestamp: '2026-09-28T00:00:00.000Z', open: 10, close: 14, volume: 300 });
});
