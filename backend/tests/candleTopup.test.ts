import { it, expect, vi } from 'vitest';
import type { Candle } from '../src/types/market.js';
import type { IExchangeAdapter } from '../src/adapters/types.js';
vi.mock('../src/storage/repositories/candlesRepository.js', () => ({ candlesRepository: { upsertCandlesBatch: vi.fn(), getCandles: vi.fn() } }));
vi.mock('../src/storage/repositories/ingestionLogRepository.js', () => ({ ingestionLogRepository: { log: vi.fn() } }));
vi.mock('../src/storage/repositories/deadLetterRepository.js', () => ({ deadLetterRepository: { record: vi.fn() } }));
import { candlesRepository } from '../src/storage/repositories/candlesRepository.js';
import { ingestDailyCandles } from '../src/ingestion/pipelines/candlesIngestionPipeline.js';

it('daily top-ups rebuild complete monthly/yearly history instead of truncating it', async () => {
  const candle = (date: string, close: number): Candle => ({ securityId: 'NSE:KCB', interval: '1d', timestamp: `${date}T00:00:00.000Z`, open: close, high: close, low: close, close, volume: 100 });
  const history = [candle('2025-01-02', 10), candle('2025-05-02', 20), candle('2025-05-28', 30)];
  vi.mocked(candlesRepository.getCandles).mockResolvedValue(history);
  const adapter = { exchange: 'NSE', getCandles: vi.fn().mockResolvedValue([history[2]]) } as unknown as IExchangeAdapter;
  await ingestDailyCandles(adapter, ['KCB'], 5);
  const derived = vi.mocked(candlesRepository.upsertCandlesBatch).mock.calls[1]![0];
  expect(derived.find((c) => c.interval === '1M')).toMatchObject({ open: 20, close: 30, volume: 200 });
  expect(derived.find((c) => c.interval === '1y')).toMatchObject({ open: 10, close: 30, volume: 300 });
  expect(derived.filter((c) => c.interval === '1M')).toHaveLength(1);
});
