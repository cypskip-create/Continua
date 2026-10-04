import { afterEach, describe, expect, it, vi } from 'vitest';
import { researchService } from '../src/services/research/researchService.js';
afterEach(() => vi.restoreAllMocks());
describe('research recomputation coalescing', () => {
  it('shares concurrent requests for the same security and price', async () => {
    const compute = vi.spyOn(researchService,'computeAndStore').mockImplementation(async () => {
      await new Promise(resolve=>setTimeout(resolve,10)); return null;
    });
    await Promise.all(Array.from({length:8},()=>researchService.recomputeAndStore('NSE:KCB',90)));
    expect(compute).toHaveBeenCalledTimes(1);
    await researchService.recomputeAndStore('NSE:KCB',91);
    expect(compute).toHaveBeenCalledTimes(2);
  });
  it('releases failed jobs so a later request can retry', async () => {
    const compute = vi.spyOn(researchService,'computeAndStore').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(null);
    await expect(researchService.recomputeAndStore('NSE:EQTY',50)).rejects.toThrow('offline');
    await expect(researchService.recomputeAndStore('NSE:EQTY',50)).resolves.toBeNull();
    expect(compute).toHaveBeenCalledTimes(2);
  });
});
