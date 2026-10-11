import {expect,it,vi} from 'vitest';
const query=vi.hoisted(()=>vi.fn().mockResolvedValue({rows:[]}));
vi.mock('../src/storage/db.js',()=>({query}));
import {financialsRepository} from '../src/storage/repositories/financialsRepository.js';
import {computeRatios} from '../src/services/research/ratiosEngine.js';
it('latest and historical reads exclude unpublished future periods and support partial statements',async()=>{
 await financialsRepository.getLatestPeriodBundle('NSE:SCOM');
 await financialsRepository.getHistoricalPeriods('NSE:SCOM','annual',20);
 for(const [sql] of query.mock.calls){expect(sql).toContain('p.period_end <= CURRENT_DATE');expect(sql).toContain('p.reported_at <= CURRENT_DATE');expect(sql).toContain('LEFT JOIN market.balance_sheets');}
});
it('uses reported EPS without guessing shares; incomplete statements do not become zero-valued ratios',()=>{
 const ratios=computeRatios({price:35.75,eps:2.39,netIncome:73676000000,revenue:427559100000,totalEquity:null});
 expect(ratios.pe).toBe(14.9582);expect(ratios.roic).toBeUndefined();expect(ratios.pb).toBeUndefined();
});
