import { describe, it, expect, vi } from 'vitest';
import { fundamentalsCollector } from '../src/ingestion/collectors/fundamentalsCollector.js';
import type { IExchangeAdapter, FundamentalsBundle } from '../src/adapters/types.js';

describe('historical fundamentals ingestion', () => {
  it('passes every available reporting period to storage, not just the latest', async () => {
    const periods = [2022, 2023, 2024].map(year => ({ period: { fiscalYear: year } } as FundamentalsBundle));
    const latest = vi.fn();
    const adapter = { exchange: 'NSE', getFundamentalsHistory: async () => periods, getFundamentals: latest } as unknown as IExchangeAdapter;
    const result = await fundamentalsCollector.collectForSymbols(adapter, ['KCB']);
    expect(result.bundles).toEqual(periods);
    expect(result.failures).toEqual([]);
    expect(latest).not.toHaveBeenCalled();
  });
  it('continues supporting a latest-only provider without inventing historical periods', async () => {
    const latest = { period: { fiscalYear: 2024 } } as FundamentalsBundle;
    const adapter = { exchange: 'NSE', getFundamentals: async () => latest } as unknown as IExchangeAdapter;
    expect((await fundamentalsCollector.collectForSymbols(adapter, ['KCB'])).bundles).toEqual([latest]);
  });
});
