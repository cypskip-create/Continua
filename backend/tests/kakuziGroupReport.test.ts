import {expect,it,vi} from 'vitest';
vi.mock('../src/storage/db.js',()=>({withTransaction:vi.fn()}));
import {validateKakuziGroupReport} from '../src/ingestion/normalizers/kakuziGroupReport.js';
const text=`ANNOUNCEMENT OF GROUP RESULTS FOR THE YEAR ENDED
31 DECEMBER 2017
Condensed consolidated statement of profit or loss and other
comprehensive income
31 December 2017 \t31 December 2016
Shs’000 \tShs’000
Sales \t2,823,926 \t2,651,199
Profit before income tax \t849,123 \t757,779
Income tax expense \t(257,480 ) \t(195,354 )
Profit for the year \t591,643 \t562,425
Earnings per share (Shs):
Basic and diluted earnings per ordinary share \t30.19 \t28.70
Condensed Consolidated Statement of Financial Position
31 December 2017 \t31 December 2016
Shs’000 \tShs’000
Total equity \t4,322,036 \t3,846,258
Non-current liabilities \t807,190 \t801,418
Non-current assets \t3,338,922 \t3,015,067
Current assets \t758,455 \t618,771
Cash and bank balances \t1,648,749 \t1,430,576
Current liabilities \t(616,900 ) \t(416,738 )
Net current assets \t1,790,304 \t1,632,609
OVERVIEW:
audited by Deloitte & Touche
BY ORDER OF THE BOARD
G H Mclean
Chairman
22 March 2018
KAKUZI PLC`;
it('reconstructs gross balance totals without scaling EPS or inventing cash flow',()=>{
 const entries=validateKakuziGroupReport(text,'NSE:KUKZ');
 expect(entries).toHaveLength(2);
 expect(entries[0]!.confirmation.periods[0]!.income).toEqual({revenue:2823926000,netIncome:591643000,eps:30.19});
 expect(entries[1]!.confirmation.periods[0]!.balance).toMatchObject({totalAssets:5746126000,totalLiabilities:1424090000,totalEquity:4322036000,currentAssets:2407204000});
 expect(entries[1]!.confirmation.periods[1]!.period.reportedAt).toBe('2018-03-22');
});
it.each([text.replace('KAKUZI PLC','Other Company'),text.replace('4,322,036','4,422,036'),text.replace('591,643','691,643'),text.replace('Shs’000','USD'),text.replace('2017 \t31 December 2016','2016 \t31 December 2017'),text.replace('22 March 2018','23 March 2018')])('fails closed on scope, unit, column, date or reconciliation ambiguity',invalid=>expect(()=>validateKakuziGroupReport(invalid,'NSE:KUKZ')).toThrow());
