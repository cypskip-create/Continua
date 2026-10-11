import {test} from 'node:test';
import assert from 'node:assert/strict';
import {financialYearCoverage,isPublishedFinancialPeriod} from '../src/lib/financialCoverage.ts';
test('invalid future filings cannot reappear from a saved app cache',()=>{
 assert.equal(isPublishedFinancialPeriod({periodEnd:'2026-12-31',reportedAt:'2027-03-15'},'2026-10-11'),false);
 assert.equal(isPublishedFinancialPeriod({periodEnd:'2026-03-31',reportedAt:'2026-05-06'},'2026-10-11'),true);
});
test('coverage exposes missing fiscal years instead of pretending sparse history is continuous',()=>{
 assert.deepEqual(financialYearCoverage([{fiscalYear:2023},{fiscalYear:2025,sourceUrls:['https://www.nse.co.ke/report.pdf']}]),{years:[2023,2025],missing:[2024],sourceBackedYears:[2025]});
});
