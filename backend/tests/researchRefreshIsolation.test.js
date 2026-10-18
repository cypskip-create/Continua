import {expect, it, vi} from 'vitest';
vi.mock('../src/storage/repositories/securitiesRepository.js', () => ({securitiesRepository: {
    listForResearchRefresh: async () => ['A', 'B', 'C'].map(s => ({id: 'NSE:' + s})),
}}));
vi.mock('../src/storage/repositories/pricesRepository.js', () => ({pricesRepository: {getQuote: async () => ({lastPrice: 10})}}));
import {researchService} from '../src/services/research/researchService.js';
it('a failing issuer cannot prevent automatic processing of the remaining registry', async () => {
    const compute = vi.spyOn(researchService, 'recomputeAndStore').mockRejectedValueOnce(Error('Fixture outage')).mockResolvedValueOnce({ratios: {}, score: {}}).mockResolvedValueOnce(null);
    try {
        expect(await researchService.recomputeAllForExchange('NSE')).toEqual({computed: 1, skipped: 1, failed: 1, pending: 0});
        expect(compute.mock.calls.map(c => c[0])).toEqual(['NSE:A', 'NSE:B', 'NSE:C']);
    } finally {compute.mockRestore();}
});
