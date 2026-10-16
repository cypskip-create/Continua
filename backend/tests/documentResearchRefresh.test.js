import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ query: vi.fn(), quote: vi.fn(), compute: vi.fn(), del: vi.fn() }));
vi.mock('../src/storage/db.js', () => ({ query: m.query, withTransaction: vi.fn() }));
vi.mock('../src/storage/repositories/pricesRepository.js', () => ({ pricesRepository: { getQuote: m.quote } }));
vi.mock('../src/services/research/researchService.js', () => ({ researchService: { recomputeAndStore: m.compute } }));
vi.mock('../src/storage/cache.js', () => ({ cache: { del: m.del }, CacheKeys: { ratios: () => 'ratios', afriScore: () => 'score' } }));
import { drainDocumentResearchRefresh } from '../src/ingestion/pipelines/automaticDocumentPublication.js';
const row = { extraction_id: 10, validator_version: 'v1', result: { securityId: 'NSE:KCB', symbol: 'KCB' } };
beforeEach(() => {
    vi.resetAllMocks();
    m.query.mockImplementation(async sql => ({ rows: sql.startsWith('WITH due') ? [row] : [] }));
    m.quote.mockResolvedValue({ lastPrice: 90 });
    m.compute.mockResolvedValue({ ratios: {} });
});
it('acknowledges only after research and both cache invalidations finish', async () => {
    await drainDocumentResearchRefresh();
    expect(m.compute).toHaveBeenCalledWith('NSE:KCB', 90);
    expect(m.query.mock.calls.at(-1)[0]).toContain('researchRefreshPending":false');
    expect(m.query.mock.calls[0][0]).toContain('SKIP LOCKED');
    expect(m.query.mock.calls[0][0]).toContain('LIMIT 5');
    expect(m.query.mock.calls[0][0]).toContain('NULLS FIRST,extraction_id');
});
it.each(['missingQuote', 'missingInputs', 'calculationFailure', 'cacheFailure'])('retains durable retry on %s', async failure => {
    if (failure === 'missingQuote') m.quote.mockResolvedValue(null);
    if (failure === 'missingInputs') m.compute.mockResolvedValue(null);
    if (failure === 'calculationFailure') m.compute.mockRejectedValue(new Error('offline'));
    if (failure === 'cacheFailure') m.del.mockRejectedValue(new Error('offline'));
    await drainDocumentResearchRefresh();
    expect(m.query).toHaveBeenCalledTimes(1);
});
it('coalesces overlapping worker ticks', async () => {
    let finish;
    m.query.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const first = drainDocumentResearchRefresh();
    const second = drainDocumentResearchRefresh();
    expect(first).toBe(second);
    finish({ rows: [] });
    await first;
});
