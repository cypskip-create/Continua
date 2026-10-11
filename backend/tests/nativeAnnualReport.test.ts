import { expect,it,vi } from 'vitest';
vi.mock('../src/storage/db.js',()=>({withTransaction:vi.fn()}));
import { validateNativeAnnualReport } from '../src/ingestion/normalizers/nativeAnnualReport.js';
const text=`Example Issuer PLC
Approved on 1 March 2026
CONSOLIDATED STATEMENT OF COMPREHENSIVE INCOME
For the year ended 31 December 2025
KShs '000
2025    2024
Revenue    120,000    100,000
Profit before tax    30,000    25,000
Income tax expense    (9,000)    (7,500)
Profit after tax    21,000    17,500
Earnings per share (KShs)    2.10    1.75
\fCONSOLIDATED STATEMENT OF FINANCIAL POSITION
As at 31 December 2025
KShs '000
2025    2024
Total assets    300,000    250,000
Total liabilities    100,000    90,000
Total equity    200,000    160,000`;
it('validates explicit annual columns with accounting checks, scaling money but not EPS',()=>{
  const entries=validateNativeAnnualReport(text,'Example Issuer PLC','NSE:EXAMPLE');
  expect(entries).toHaveLength(2);
  expect(entries[0]!.confirmation.periods[0]!.income).toEqual({revenue:120e6,netIncome:21e6,eps:2.1});
  expect(entries[1]!.confirmation.periods[1]!).toMatchObject({sourcePage:2,period:{fiscalYear:2024,periodEnd:'2024-12-31'}});
});
it.each([
  text.replace("KShs '000",'Unknown units'),text.replace('Revenue    120,000','Revenue    12O,000'),
  text.replace('Total equity    200,000','Total equity    201,000'),text.replace('21,000','22,000'),
  text.replace('2025    2024','2024    2025'),text.replace('Approved on 1 March 2026','Approved on 1 January 2025'),
  text.replace('Earnings per share (KShs)','Earnings per share'),text.replace('CONSOLIDATED STATEMENT OF COMPREHENSIVE INCOME','CONSOLIDATED STATEMENT OF COMPREHENSIVE INCOME\nCompany 2025 Group 2024'),
])('requires review rather than guessing ambiguous or unreconciled native cells',invalid=>{
  expect(()=>validateNativeAnnualReport(invalid,'Example Issuer PLC','NSE:EXAMPLE')).toThrow();
});
it('rejects another issuer even when a filing title resolves loosely',()=>{
  expect(()=>validateNativeAnnualReport(text,'Different Issuer PLC','NSE:EXAMPLE')).toThrow('issuer identity');
});
