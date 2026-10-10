import { expect, it, vi } from 'vitest';
vi.mock('../src/storage/db.js',()=>({withTransaction:vi.fn()}));
import { HistoricalConfirmSchema } from '../src/ingestion/confirmHistoricalColumns.js';
import { historicalColumnDrafts } from '../src/ingestion/financialsDraft.js';
it('keeps all comparative columns and avoids silently combining group/company rows',()=>{
  const drafts=historicalColumnDrafts([{label:'Revenue',values:['120','100','80']},{label:'Net profit',values:['24','20','16']}],'income');
  expect(drafts.map(d=>d.mapped.revenue)).toEqual([120,100,80]);
  expect(historicalColumnDrafts([{label:'Revenue',values:['100']},{label:'Group revenue',values:['200']}],'income')[0]!.mapped.revenue).toBeNull();
});
const period={periodType:'annual',fiscalYear:2025,periodEnd:'2025-12-31',reportedAt:'2026-03-01',currency:'KES'};
const entry={columnIndex:0,period,income:{revenue:100,netIncome:20,eps:2},sourcePage:12,note:'Verified group amounts in base KES.'};
const payload={statementType:'income',unitsVerified:true,periods:[entry]};
it('requires explicit unit verification and exact dated reporting periods',()=>{
  expect(HistoricalConfirmSchema.safeParse(payload).success).toBe(true);
  expect(HistoricalConfirmSchema.safeParse({...payload,unitsVerified:false}).success).toBe(false);
  expect(HistoricalConfirmSchema.safeParse({...payload,periods:[{...entry,period:{...period,periodEnd:'2025-02-30'}}]}).success).toBe(false);
});
it('rejects duplicate columns, duplicated periods and missing cashflow amounts',()=>{
  expect(HistoricalConfirmSchema.safeParse({...payload,periods:[entry,entry]}).success).toBe(false);
  expect(HistoricalConfirmSchema.safeParse({...payload,statementType:'cashflow',periods:[{...entry,cashflow:{}}]}).success).toBe(false);
});
it('blocks invalid balance sheets rather than publishing invented history',()=>{
  expect(HistoricalConfirmSchema.safeParse({...payload,statementType:'balance',periods:[{...entry,balance:{totalAssets:100,totalLiabilities:80,totalEquity:60}}]}).success).toBe(false);
});
