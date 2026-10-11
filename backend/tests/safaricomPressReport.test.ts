import {expect,it,vi} from 'vitest';
vi.mock('../src/storage/db.js',()=>({withTransaction:vi.fn()}));
import {validateSafaricomPressReport} from '../src/ingestion/normalizers/safaricomPressReport.js';
const text=`SAFARICOM LIMITED ANNOUNCES AUDITED RESULTS FOR THE YEAR ENDED 31 MARCH 2016.
Condensed consolidated statement of comprehensive income
Kshs bn 31-Mar-16 31-Mar-15 % Increase/(Decrease)
Total Revenue    195.68    163.36    19.78
EBITDA    83.07    71.19    16.69
Earnings Before Taxation    55.76    46.16    20.80
Taxation    (17.66)    (14.28)    23.67
Net Income    38.10    31.87    19.55
Condensed consolidated statement of financial position
Free Cash flow
Kshs bn 31-Mar-16 31-Mar-15 % Increase/(Decrease)
Capital Additions    (33.34)    (33.70)    (1.56)
Free cash flow    30.36    27.52    10.32`;
it('publishes older monetary comparatives without inventing EPS, CFO or an earlier release date',()=>{
 const entries=validateSafaricomPressReport(text,'2026-10-11');
 expect(entries[0]!.confirmation.periods[1]).toMatchObject({period:{fiscalYear:2015,reportedAt:'2026-10-11'},income:{revenue:163360000000,netIncome:31870000000}});
 expect(entries[0]!.confirmation.periods[0]!.income!.eps).toBeUndefined();
 expect(entries[1]!.confirmation.periods[0]!.cashflow).toEqual({freeCashFlow:30360000000,capex:33340000000});
});
it.each([text.replace('163.36','163.3O'),text.replace('Kshs bn','Unknown units'),text.replace('31.87','41.87'),text.replace('31-Mar-15','31-Mar-14')])('retains corrupted legacy layouts for review',invalid=>expect(()=>validateSafaricomPressReport(invalid,'2026-10-11')).toThrow());
