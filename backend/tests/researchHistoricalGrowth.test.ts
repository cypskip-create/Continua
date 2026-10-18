import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({latest:vi.fn(),history:vi.fn(),score:vi.fn()}));
vi.mock('../src/storage/repositories/financialsRepository.js',()=>({financialsRepository:{getLatestPeriodBundle:mocks.latest,getHistoricalPeriods:mocks.history}}));
vi.mock('../src/storage/repositories/candlesRepository.js',()=>({candlesRepository:{getCandles:vi.fn().mockResolvedValue([])}}));
vi.mock('../src/storage/repositories/corporateActionsRepository.js',()=>({corporateActionsRepository:{getDividendsBySecurity:vi.fn().mockResolvedValue([])}}));
vi.mock('../src/storage/repositories/scoresRepository.js',()=>({scoresRepository:{upsertRatios:vi.fn(),upsertAfriScore:vi.fn(),upsertResearchSnapshot:vi.fn()}}));
vi.mock('../src/services/research/afriScore.js',()=>({computeAfriScore:mocks.score}));
vi.mock('../src/storage/repositories/securitiesRepository.js',()=>({securitiesRepository:{getSectorName:vi.fn().mockResolvedValue(null)}}));
vi.mock('../src/storage/repositories/pricesRepository.js',()=>({pricesRepository:{getQuote:vi.fn().mockResolvedValue(null)}}));
import { researchService } from '../src/services/research/researchService.js';
import {scoresRepository} from '../src/storage/repositories/scoresRepository.js';
beforeEach(()=>{vi.clearAllMocks();mocks.latest.mockResolvedValue({fiscalYear:2026,revenue:120,netIncome:20,eps:2});mocks.score.mockReturnValue({});});
it('uses the preceding year, not the latest row itself, for growth',async()=>{
  mocks.history.mockResolvedValue([{fiscalYear:2026,revenue:120,eps:2},{fiscalYear:2025,revenue:100,eps:1}]);
  await researchService.computeAndStore('NSE:ABSA',100);
  expect(mocks.score.mock.calls[0]![1]).toMatchObject({revenueGrowthYoy:0.2,epsGrowthYoy:1});
});
it('does not label a multi-year reporting gap as annual growth',async()=>{
  mocks.history.mockResolvedValue([{fiscalYear:2026,revenue:120,eps:2},{fiscalYear:2015,revenue:100,eps:1}]);
  await researchService.computeAndStore('NSE:ABSA',100);
  expect(mocks.score.mock.calls[0]![1]).toMatchObject({revenueGrowthYoy:undefined,epsGrowthYoy:undefined});
});
it('withdrawn financial coverage clears a stale derived snapshot instead of retaining its old score',async()=>{
 mocks.latest.mockResolvedValue(null);mocks.history.mockResolvedValue([]);mocks.score.mockReturnValue({afriScore:null});
 expect(await researchService.computeAndStore('NSE:ABSA',100)).toBeNull();
 expect(scoresRepository.upsertResearchSnapshot).toHaveBeenCalledWith(expect.objectContaining({securityId:'NSE:ABSA'}),expect.objectContaining({afriScore:null}));
});
