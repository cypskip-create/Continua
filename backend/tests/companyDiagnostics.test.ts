import {expect,it} from 'vitest';
import {companyDiagnostics} from '../src/services/research/companyDiagnostics.js';
it('keeps missing years and absent evidence unknown rather than favorable',()=>{
 const d=companyDiagnostics([{fiscalYear:2015,revenue:100,netIncome:20},{fiscalYear:2026,revenue:110,netIncome:10}]);
 expect(d.checks.find(c=>c.id==='margin')?.result).toBe('unknown');
 expect(d.checks.find(c=>c.id==='cash')?.result).toBe('unknown');
 expect(d.evidence[0]?.basis).toBe('Stored figure without reviewed URL');
});
it('uses adjacent-year cash and margin evidence and retains provenance',()=>{
 const d=companyDiagnostics([{fiscalYear:2025,revenue:100,netIncome:20},{fiscalYear:2026,revenue:200,netIncome:20,operatingCashFlow:25,totalAssets:100,sourceUrls:['https://www.nse.co.ke/a.pdf'],reportedAt:'2026-05-01'}]);
 expect(d.checks.find(c=>c.id==='margin')?.result).toBe('flag');
 expect(d.checks.find(c=>c.id==='cash')?.result).toBe('pass');
 expect(d.trends[1]?.accrualsToAssets).toBe(-.05);
 expect(d.evidence.at(-1)?.sourceUrls).toEqual(['https://www.nse.co.ke/a.pdf']);
});
