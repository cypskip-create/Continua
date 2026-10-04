import { describe, it, expect } from 'vitest';
import { normalizeNseIndices } from '../src/adapters/nse/nseIndices.js';
describe('published NSE indices', () => {
  it('derives percentage from point change and preserves the observation date', () => {
    const [index] = normalizeNseIndices([{ kind: 'nse_index', code: 'NASI', value: 101, change: 1, asOf: '2025-01-02' }]);
    expect(index?.previousClose).toBe(100);
    expect(index?.changePercent).toBe(1);
    expect(index?.source).toBe('eod');
    expect(index?.timestamp).toBe('2025-01-02T00:00:00.000Z');
  });
  it('rejects unknown indices, invented future dates and invalid levels', () => {
    expect(normalizeNseIndices([{ kind: 'nse_index', code: 'FAKE', value: 101, change: 1, asOf: '2025-01-02' }])).toEqual([]);
    expect(normalizeNseIndices([{ kind: 'nse_index', code: 'NASI', value: 0, change: 1, asOf: '2025-01-02' }])).toEqual([]);
    expect(normalizeNseIndices([{ kind: 'nse_index', code: 'NASI', value: 101, change: 1, asOf: '2099-01-02' }])).toEqual([]);
  });
});
