import {expect,it,vi} from 'vitest';
vi.mock('../src/storage/db.js',()=>({withTransaction:vi.fn()}));
import {validateKcbGroupReport} from '../src/ingestion/normalizers/kcbGroupReport.js';
const header=`KCB GROUP PLC AUDITED RESULTS AND OTHER DISCLOSURES
FOR THE YEAR ENDED 31ST DECEMBER 2017
BANK  KCB GROUP PLC -COMPANY  KCB GROUP PLC-CONSOLIDATED
31-Dec-16  31-Dec-17  31-Dec-16  31-Dec-17  31-Dec-16  31-Dec-17
Kshs 000  Kshs 000  Kshs 000  Kshs 000  Kshs 000  Kshs 000`;
const row=(label:string,a:string,b:string)=>`${label}  1  2  3  4  ${a}  ${b}`;
const text=[header+'\n'+[row('21 TOTAL ASSETS','595,239,643','646,668,939'),row('34 TOTAL LIABILITIES','498,673,868','540,703,066'),row("43 TOTAL SHAREHOLDERS' FUNDS",'96,565,775','105,965,873')].join('\n'),header+'\n'+[
 row('3 NET INTEREST INCOME/(LOSS)','47,026,644','48,384,773'),row('4.6 Total other operating income','22,450,006','23,000,810'),row('5 TOTAL OPERATING INCOME','69,476,650','71,385,583'),row('6.8 Total other operating expenses','40,385,525','42,271,381'),row('9 Profit/(loss) after exceptional items','29,091,125','29,114,202'),row('10 Current tax','(9,171,465)','(10,142,554)'),row('11 Deferred tax','(197,213)','733,483'),row('12 Profit/(loss) after tax and exceptional items','19,722,447','19,705,131'),row('18 EARNINGS PER SHARE- DILUTED & BASIC KSHS','6.43','6.43')].join('\n'),header+'\naudited by\nKPMG-Kenya\nfinancial statements were approved by the Board of Directors on Wednesday, 7 March, 2018'].join('\f');
it('keeps consolidated last-two columns separate from bank and parent figures',()=>{
 const entries=validateKcbGroupReport(text,'NSE:KCB');
 expect(entries[1]!.confirmation.periods[1]!).toMatchObject({columnIndex:5,sourcePage:2,period:{fiscalYear:2017,reportedAt:'2018-03-07'},income:{revenue:71385583000,netIncome:19705131000,eps:6.43}});
 expect(entries[0]!.confirmation.periods[0]!.balance?.totalAssets).toBe(595239643000);
});
it.each([text.replace('CONSOLIDATED','BANK'),text.replace('96,565,775','96,665,775'),text.replace('6.43','not reported'),text.replace('69,476,650','69,576,650'),text.replace('7 March, 2018','8 March, 2018')])('rejects changed scope or unreconciled cells',bad=>expect(()=>validateKcbGroupReport(bad,'NSE:KCB')).toThrow());
