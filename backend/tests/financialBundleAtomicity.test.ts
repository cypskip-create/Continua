import {expect,it,vi} from 'vitest';
const {query,transactionQuery,withTransaction}=vi.hoisted(()=>({query:vi.fn(),transactionQuery:vi.fn(),withTransaction:vi.fn()}));
vi.mock('../src/storage/db.js',()=>({query,withTransaction}));
import {financialsRepository} from '../src/storage/repositories/financialsRepository.js';

const period={id:'fixture-period',securityId:'NSE:CGEN',periodType:'annual',fiscalYear:2024,periodEnd:'2024-12-31',reportedAt:'2025-03-01',currency:'KES'};
it('uses one transaction and preserves a reviewed statement',async()=>{
    transactionQuery.mockReset().mockResolvedValue({rows:[{reviewed:true}]});
    withTransaction.mockImplementation(async action=>action({query:transactionQuery}));
    await expect(financialsRepository.upsertPeriodBundle(period as any,{periodId:period.id} as any,{periodId:period.id} as any,{periodId:period.id} as any)).rejects.toThrow('cannot overwrite reviewed');
    expect(transactionQuery.mock.calls).toHaveLength(2);
    expect(query).not.toHaveBeenCalled();
});
it('propagates a component failure to the transaction owner before any later writes',async()=>{
    transactionQuery.mockReset().mockImplementation(async sql=>{
        if(sql.includes('INSERT INTO market.balance_sheets'))throw new Error('fixture failure');
        return {rows:[{reviewed:false}]};
    });
    withTransaction.mockImplementation(async action=>action({query:transactionQuery}));
    await expect(financialsRepository.upsertPeriodBundle(period as any,{periodId:period.id} as any,{periodId:period.id} as any,{periodId:period.id} as any)).rejects.toThrow('fixture failure');
    expect(transactionQuery.mock.calls.some(([sql])=>sql.includes('cash_flow_statements'))).toBe(false);
    expect(query).not.toHaveBeenCalled();
});
