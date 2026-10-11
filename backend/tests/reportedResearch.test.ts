import {it,expect} from 'vitest';
import {reportedResearchRatios} from '../src/services/research/reportedResearch.js';
const q={lastPrice:89.75,timestamp:'2026-10-09T12:00:00Z',source:'live'};
const rows=[{fiscalYear:2017,periodEnd:'2017-12-31',reportedAt:'2018-03-07',eps:6.43,netIncome:20,revenue:100,sourceUrls:['https://issuer.co.ke/results.pdf']},{fiscalYear:2026,periodEnd:'2026-12-31',reportedAt:'2027-03-15',eps:1,sourceUrls:['https://issuer.co.ke/future.pdf']}];
it('uses the same dated financial basis as chart ratios, never future filings',()=>{expect(reportedResearchRatios('NSE:KCB',q,rows,null)?.pe).toBeCloseTo(13.958,3);});
it('does not reuse an untraceable filing or mock quote',()=>{expect(reportedResearchRatios('NSE:KCB',q,[{...rows[0]!,sourceUrls:[]}],null)).toBeNull();expect(reportedResearchRatios('NSE:KCB',{...q,source:'mock'},rows,null)).toBeNull();});
