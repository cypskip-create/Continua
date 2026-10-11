import {it,expect,vi} from 'vitest';
vi.mock('../src/storage/repositories/scoresRepository.js',()=>({scoresRepository:{getSectorAverageRatios:vi.fn().mockResolvedValue({avgPe:10,sampleSize:3})}}));
import {relativeValuationModel} from '../src/services/technical/valuationService.js';
import {scoresRepository} from '../src/storage/repositories/scoresRepository.js';
it('uses reported EPS directly and same-year peers rather than reverse-engineering cached P/E',async()=>{
 const result=await relativeValuationModel('NSE','NSE:KCB','banking',89.75,{eps:6.43,fiscalYear:2017});
 expect(result.fairValue).toBe(64.3);expect(result.inputs.reportedAnnualEps).toBe(6.43);expect(scoresRepository.getSectorAverageRatios).toHaveBeenCalledWith('NSE','banking','NSE:KCB',2017);
});
it('missing earnings never becomes EPS inferred from price',async()=>{const r=await relativeValuationModel('NSE','NSE:KCB','banking',89.75,null);expect(r.fairValue).toBeNull();expect(r.unavailableReason).toContain('never inferred');});
