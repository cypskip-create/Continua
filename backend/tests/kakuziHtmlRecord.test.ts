import {expect,it,vi} from 'vitest';
vi.mock('../src/storage/db.js',()=>({withTransaction:vi.fn()}));
import {validateKakuziHtmlRecord} from '../src/ingestion/normalizers/kakuziHtmlRecord.js';
import type {DetectedFinancialTable} from '../src/types/market.js';
const text="Five Year Record All amounts are stated in Kenyan shillings thousands (shs’000) except where otherwise indicated.";
const table:DetectedFinancialTable={title:null,headerLine:" | 2025 Shs'000 | 2024 Shs'000 | 2023 Shs'000 | 2022 Shs'000 | 2021 Shs'000",method:'html_table_v1',confidence:.7,rows:[
 {label:'Turnover',values:['5,368,622','4,791,692','5,401,468','4,434,211','3,296,414']},
 {label:'(Loss)/Profit attributable to the members of Kakuzi Plc',values:['387,573','(131,694)','453,517','845,804','319,736']},
 {label:'Basic earnings per ordinary share (Shs)',values:['19.77','(6.72)','23.14','43.15','16.31']},
 {label:'Other comprehensive income',values:['3,955','1,322','2,114','-5,176','6,038']},
 {label:'Total comprehensive(Loss)/income',values:['391,528','(130,372)','455,631','840,628','325,774']},
]};
it('publishes five source columns with signed losses, unscaled EPS and conservative availability',()=>{
 const entries=validateKakuziHtmlRecord(text,[table],'NSE:KUKZ','2026-10-11');
 expect(entries[0]!.confirmation.periods).toHaveLength(5);
 expect(entries[0]!.confirmation.periods[1]).toMatchObject({income:{revenue:4791692000,netIncome:-131694000,eps:-6.72},period:{periodEnd:'2024-12-31',reportedAt:'2026-10-11'}});
 expect(entries[0]!.confirmation.periods[0]!.balance).toBeUndefined();
});
it.each(['order','units','income','duplicate','eps','incomplete'])('rejects ambiguous %s',kind=>{
 const t=structuredClone(table);
 if(kind==='order')t.headerLine=t.headerLine!.replace('2025','2020');
 if(kind==='income')t.rows[1]!.values[0]='487,573';
 if(kind==='duplicate')t.rows.push(t.rows[0]!);
 if(kind==='eps')t.rows[2]!.values[1]='6.72';
 if(kind==='incomplete')t.rows[0]!.values.pop();
 expect(()=>validateKakuziHtmlRecord(kind==='units'?text.replace('Kenyan shillings','USD'):text,[t],'NSE:KUKZ','2026-10-11')).toThrow();
});
