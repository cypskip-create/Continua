import {expect,it,vi} from 'vitest';
vi.mock('../src/storage/db.js',()=>({withTransaction:vi.fn()}));
import {validateCondensedGroupReport} from '../src/ingestion/normalizers/condensedGroupReport.js';
// Rows transcribed from the visually verified official NSE FY2026 SCOM PDF.
const header='Group (KShs Mn)\tCompany (KShs Mn)\n31-Mar-26\t31-Mar-25\t31-Mar-26\t31-Mar-25';
const source=`SAFARICOM PLC CONDENSED AUDITED RESULTS FOR THE
YEAR ENDED 31 MARCH 2026
Condensed consolidated statement of profit or
loss and other comprehensive income for the year
ended:
${header}
Total Revenue\t427,559.1\t388,688.9\t410,751.0\t380,478.3
Profit before income tax\t126,817.9\t93,210.5\t170,386.1\t141,251.7
Income tax expense\t(53,141.9)\t(47,453.3)\t(52,032.2)\t(46,297.6)
Profit for the year\t73,676.0\t45,757.2\t118,353.9\t94,954.1
Profit for the year\t73,676.0\t45,757.2\t118,353.9\t94,954.1
Basic and diluted earnings per share (EPS)\t2.39\t1.74\t2.95\t2.37
Operating profit (EBIT)\t146,321.9\t104,050.1\t181,272.6\t157,347.5
Condensed consolidated statement
of financial position as at:
${header}
Total assets\t518,045.4\t515,284.2\t489,805.8\t432,548.0
Total liabilities\t287,124.3\t291,263.1\t181,250.0\t183,786.1
Total equity\t230,921.1\t224,021.1\t308,555.8\t248,761.9
Condensed consolidated statement of
cash flows for the year ended:
${header}
Net cash generated from operating activities\t169,907.8\t137,722.8\t180,712.2\t154,747.7
Net cash used in investing activities\t(99,843.8)\t(75,514.2)\t(82,671.1)\t(88,705.1)
Net cash used in financing activities\t(70,647.6)\t(40,677.1)\t(95,327.6)\t(69,202.1)
(Decrease)/Increase in cash and cash equivalents\t(583.6)\t21,531.5\t2,713.5\t(3,159.5)
These results were duly approved by the Board of Directors on 6 May 2026 and signed on its behalf by;`;
it('retains group comparatives, dates and unscaled EPS across all statements',()=>{
 const entries=validateCondensedGroupReport(source,'Safaricom Plc','NSE:SCOM');
 expect(entries).toHaveLength(3);
 expect(entries[0]!.confirmation.periods[1]).toMatchObject({columnIndex:1,period:{fiscalYear:2025,periodEnd:'2025-03-31',reportedAt:'2026-05-06'},income:{revenue:388688900000,eps:1.74}});
 expect(entries[1]!.confirmation.periods[0]!.balance!.totalAssets).toBe(518045400000);
 expect(entries[2]!.confirmation.periods[0]!.cashflow!.investingCashFlow).toBe(-99843800000);
});
it.each([
 source.replace('Group (KShs Mn)','Company (KShs Mn)'),
 source.replace('388,688.9','388,68O.9'),
 source.replace('230,921.1','231,921.1'),
 source.replace('(583.6)','(1,583.6)'),
 source.replace('6 May 2026','6 May 2099'),
 source.replace('1.74','174'), // EPS alone can't be independently reconciled; separately assert bounded per-share values.
])('rejects corrupted or ambiguous layouts',text=>{
 expect(()=>validateCondensedGroupReport(text,'Safaricom Plc','NSE:SCOM')).toThrow();
});
it('rejects foreign issuers',()=>expect(()=>validateCondensedGroupReport(source,'Absa Bank Kenya PLC','NSE:ABSA')).toThrow());
