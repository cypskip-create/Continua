import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('../src/storage/db.js',()=>({withTransaction:async(fn:(client:unknown)=>unknown)=>fn({query:mocks.query})}));
import { confirmHistoricalColumns } from '../src/ingestion/confirmHistoricalColumns.js';
const entry={columnIndex:0,period:{periodType:'annual',fiscalYear:2025,periodEnd:'2025-12-31',reportedAt:'2026-03-01',currency:'KES'},income:{revenue:100,netIncome:20,eps:2},sourcePage:12,note:'Original filing and base KES verified.'};
const payload={statementType:'income',unitsVerified:true,periods:[entry]};
beforeEach(()=>{vi.clearAllMocks();mocks.query.mockImplementation(async(sql:string)=>({rows:sql.includes('SELECT * FROM market.financial_statement_candidates')?[{id:1,status:'pending',security_id:'NSE:SCOM',document_url:'https://www.nse.co.ke/example.pdf',detected_table:{rows:[{values:['100']}]}}]:sql.includes('SELECT symbol FROM')?[{symbol:'SCOM'}]:[]}));});
it('locks the canonical period and retains source-page provenance for reviewed values',async()=>{
  const result=await confirmHistoricalColumns('1',payload);
  expect(result.periodIds).toEqual(['NSE:period:SCOM:2025']);
  const calls=mocks.query.mock.calls;
  expect(calls.findIndex(c=>c[0].includes('pg_advisory_xact_lock'))).toBeLessThan(calls.findIndex(c=>c[0].includes('SELECT p.*')));
  expect(calls.find(c=>c[0].includes('INSERT INTO market.filing_history_reviews'))?.[1]).toEqual(['1','NSE:period:SCOM:2025',0,'income','https://www.nse.co.ke/example.pdf',12,entry.note,JSON.stringify(entry.income),'null']);
});
it('refuses silent replacement of an existing statement',async()=>{
  const prior=mocks.query.getMockImplementation()!;
  mocks.query.mockImplementation(async(sql:string,...args:unknown[])=>sql.includes('SELECT p.*')?{rows:[{period_type:'annual',period_end:'2025-12-31',currency:'KES',reported_at:'2026-03-01',statement:{revenue:90}}]}:prior(sql,...args));
  await expect(confirmHistoricalColumns('1',payload)).rejects.toMatchObject({status:409});
  expect(mocks.query.mock.calls.some(c=>c[0].includes('INSERT INTO market.income_statements'))).toBe(false);
});
