import {expect,it,vi} from 'vitest';
vi.mock('../src/storage/db.js',()=>({query:vi.fn()}));
import {sourceFinancialTables} from '../src/services/research/publisherFinancialTables.js';
const table={kind:'publisher_table',tab:'Financials',category:'Profit/Loss',columns:['Item','2024','2023','2022','2021'],rows:[{label:'Revenue',rowKind:'total',cells:['117.24 B','96 B','88 B','75.48 B'].map(raw=>({raw}))}]};
it('preserves every real year and original publisher precision without inventing filing dates',()=>{
 const result=sourceFinancialTables([table]);expect(result[0]?.columns).toEqual(table.columns);expect(result[0]?.rows[0]?.values[0]).toBe('117.24 B');expect(result[0]).not.toHaveProperty('periodEnd');
});
it('rejects future years, malformed cell alignment and nonfinancial observations',()=>{
 expect(sourceFinancialTables([{...table,columns:['Item','2099']}])).toEqual([]);
 expect(sourceFinancialTables([{...table,columns:['Item','2024']}])).toEqual([]);
 expect(sourceFinancialTables([{...table,tab:'Holders'}])).toEqual([]);
});
it('keeps source-text UTF-16 limits when characters use surrogate pairs',()=>{
 const row=table.rows[0];if(!row)throw Error('Publisher fixture requires a source row');
 expect(sourceFinancialTables([{...table,category:'💜'.repeat(30)}])).toHaveLength(1);
 expect(sourceFinancialTables([{...table,category:'💜'.repeat(31)}])).toEqual([]);
 expect(sourceFinancialTables([{...table,rows:[{...table.rows[0],label:'💜'.repeat(251)}]}])).toEqual([]);
 expect(sourceFinancialTables([{...table,rows:[{...row,cells:[{raw:'💜'.repeat(51)},...row.cells.slice(1)]}]}])).toEqual([]);
});
