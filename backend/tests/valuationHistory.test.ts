import {describe,it,expect} from 'vitest';
import {annualRatioAt} from '../src/services/technical/valuationHistory.js';
describe('dated annual valuations',()=>{
 const periods=[{fiscalYear:2017,periodEnd:'2017-12-31',reportedAt:'2018-03-07',eps:6.43},{fiscalYear:2026,periodEnd:'2026-12-31',reportedAt:'2027-03-15',eps:5.76}];
 it('explains KCB historical and current prices without using a future filing',()=>{
  expect(annualRatioAt(periods,49.69,'2026-09-12','pe').ratio).toBeCloseTo(7.73,2);
  expect(annualRatioAt(periods,89.75,'2026-10-09','pe').ratio).toBeCloseTo(13.96,2);
  expect(annualRatioAt(periods,89.75,'2026-10-09','pe').fiscalYear).toBe(2017);
 });
 it('never backfills disclosures, missing denominators or nonpositive EPS',()=>{
  expect(annualRatioAt(periods,50,'2017-12-31','pe').ratio).toBeNull();
  expect(annualRatioAt(periods,50,'2026-10-09','pb').ratio).toBeNull();
  expect(annualRatioAt([{...periods[0]!,eps:-2}],50,'2026-10-09','pe').ratio).toBeNull();
 });
});
