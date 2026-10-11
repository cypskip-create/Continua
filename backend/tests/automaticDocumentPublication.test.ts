import {expect,it,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),db:vi.fn(),confirm:vi.fn(),upsert:vi.fn()}));
vi.mock('../src/storage/db.js',()=>({query:mocks.query,withTransaction:async(fn:any)=>fn({query:mocks.db})}));
vi.mock('../src/ingestion/confirmHistoricalColumns.js',async original=>({...await original<typeof import('../src/ingestion/confirmHistoricalColumns.js')>(),confirmHistoricalColumns:mocks.confirm}));
vi.mock('../src/storage/repositories/financialStatementCandidatesRepository.js',()=>({financialStatementCandidatesRepository:{upsert:mocks.upsert}}));
import {runAutomaticDocumentPublication} from '../src/ingestion/pipelines/automaticDocumentPublication.js';
const text=`RESULTS FOR REOPENED FIFTEEN YEAR TREASURY BONDS
ISSUE NUMBER FXD3/2019/015
ISIN KE6000001328
Due Dates 10-Jul-34
Weighted Average Rate of Accepted Bids (%) 12.7338
Price per Kshs 100 at average yield 100.6538
Coupon Rate (%) 12.3400
Director, Financial Markets
30 September 2026`;
const row={id:1,method:'native_pdf_text',artifact_id:2,sha256:'a'.repeat(64),document_url:'https://www.centralbank.go.ke/results.pdf',source_id:'cbk-bond-history',config:{},text};
beforeEach(()=>{
  vi.clearAllMocks();mocks.db.mockImplementation(async(sql:string)=>sql.includes('pg_try_advisory')?{rows:[{locked:true}]}:{rows:[],rowCount:0});
});
it('automatically publishes a complete native bond template with a hash-backed audit',async()=>{
  mocks.query.mockResolvedValue({rows:[row]});
  expect(await runAutomaticDocumentPublication()).toEqual({published:1,review:0,failed:0});
  expect(mocks.db.mock.calls.some(([sql])=>sql.includes('INSERT INTO market.research_records'))).toBe(true);
  const audit=mocks.db.mock.calls.find(([sql])=>sql.includes('INSERT INTO market.document_validations'))!;
  expect(audit[1]).toEqual(expect.arrayContaining([row.sha256,row.document_url,'published']));
});
it.each([
  {...row,method:'ocr'}, {...row,text:text.replace('100.6538','400.00')},
  {...row,needs_review:true},
  {...row,text:text.replace('10-Jul-34','10-Jul-24')},
  {...row,document_url:'https://example.org/results.pdf'},
  {...row,text:text.replace('12.7338','not reported')},
])('never publishes OCR, invalid provenance or incomplete bond data',async invalid=>{
  mocks.query.mockResolvedValue({rows:[invalid]});
  expect(await runAutomaticDocumentPublication()).toEqual({published:0,review:1,failed:0});
  expect(mocks.db.mock.calls.some(([sql])=>sql.includes('INSERT INTO market.research_records'))).toBe(false);
});
it('preserves a conflicting existing observation rather than silently restating it',async()=>{
  mocks.query.mockResolvedValue({rows:[row]});
  mocks.db.mockImplementation(async(sql:string)=>sql.includes('pg_try_advisory')?{rows:[{locked:true}]}:sql.includes('SELECT source_url')?{rows:[{source_url:row.document_url,payload:{yield:99}}]}:{rows:[],rowCount:0});
  expect(await runAutomaticDocumentPublication()).toEqual({published:0,review:1,failed:0});
  expect(mocks.db.mock.calls.some(([sql])=>sql.includes('INSERT INTO market.research_records'))).toBe(false);
});
const htmlRow={...row,id:3,method:'html',source_id:'kakuzi-record-filings',document_url:'https://www.kakuzi.co.ke/five-year-record',extracted_at:'2026-10-11T10:00:00Z',config:{allowedDomains:['kakuzi.co.ke']},text:"Five Year Record All amounts are stated in Kenyan shillings thousands (shs’000) except where otherwise indicated.",tables:[{title:null,headerLine:" | 2025 Shs'000 | 2024 Shs'000 | 2023 Shs'000 | 2022 Shs'000 | 2021 Shs'000",method:'html_table_v1',confidence:.7,rows:[
 {label:'Turnover',values:Array(5).fill('100')},
 {label:'(Loss)/Profit attributable to the members of Kakuzi Plc',values:Array(5).fill('10')},
 {label:'Basic earnings per ordinary share (Shs)',values:Array(5).fill('1')},
 {label:'Other comprehensive income',values:Array(5).fill('2')},
 {label:'Total comprehensive(Loss)/income',values:Array(5).fill('12')},
]}]};
it('publishes only the registered reconciled HTML template into canonical history',async()=>{
 mocks.query.mockResolvedValueOnce({rows:[htmlRow]}).mockResolvedValue({rows:[]});
 mocks.db.mockImplementation(async(sql:string)=>sql.includes('pg_try_advisory')?{rows:[{locked:true}]}:sql.includes('SELECT s.id,s.company_id')?{rows:[{id:'NSE:KUKZ',company_id:'NSE:company:KUKZ',name:'Kakuzi PLC'}]}:sql.startsWith('SELECT id::text FROM market.financial_statement_candidates')?{rows:[{id:'99'}]}:{rows:[],rowCount:0});
 expect(await runAutomaticDocumentPublication()).toEqual({published:1,review:0,failed:0});
 expect(mocks.upsert).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({query:expect.any(Function)}));
 expect(mocks.confirm).toHaveBeenCalledWith('99',expect.objectContaining({statementType:'income',periods:expect.arrayContaining([expect.objectContaining({income:{revenue:100000,netIncome:10000,eps:1}})])}),expect.anything());
});
it('selects only the latest extraction and drains oldest records first',async()=>{
 mocks.query.mockResolvedValue({rows:[]});
 await runAutomaticDocumentPublication();
 const sql=mocks.query.mock.calls[0]![0] as string;
 expect(sql).toContain('newer.artifact_id=e.artifact_id');
 expect(sql).toContain('ORDER BY e.id ASC');
});
it.each([
 {...htmlRow,source_id:'nse'},
 {...htmlRow,document_url:'https://www.kakuzi.co.ke/unknown'},
 {...htmlRow,document_url:'https://example.org/five-year-record'},
])('keeps unregistered HTML provenance or paths in review',async invalid=>{
 mocks.query.mockResolvedValue({rows:[invalid]});
 expect(await runAutomaticDocumentPublication()).toEqual({published:0,review:1,failed:0});
 expect(mocks.confirm).not.toHaveBeenCalled();
});
