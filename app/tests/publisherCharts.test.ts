import assert from 'node:assert/strict';
import {test} from 'node:test';
import {publisherChartGroups,publisherFinancialPeriods,publisherCurrentMultiple} from '../src/lib/publisherCharts.ts';

test('current observed multiples need literal positive per-share inputs, not invented shares or dates',()=>{
 const row={fiscalYear:2024,basis:'publisher_observation' as const,revenue:100,netIncome:20,eps:2};
 assert.equal(publisherCurrentMultiple(row,10,'pe'),5);
 assert.equal(publisherCurrentMultiple(row,10,'pb'),null);
 assert.equal(publisherCurrentMultiple({...row,eps:-1},10,'pe'),null);
 assert.equal(publisherCurrentMultiple({...row,totalEquity:40,sharesOutstanding:10},10,'pb'),2.5);
});
test('mapped reported history retains unknowns and withholds conflicts instead of inventing forecasts or dates',()=>{
 const base={destination:'financials',status:'publisher_observation'};
 const rows=publisherFinancialPeriods([{...base,financialFields:[{metric:'netIncome',year:2024,value:25},{metric:'eps',year:2024,value:0}]},{...base,financialFields:[{metric:'netIncome',year:2024,value:26}]}]);
 assert.equal(rows[0].netIncome,null);assert.equal(rows[0].eps,0);assert.equal(rows[0].revenue,null);
 assert.equal(rows[0].reportedAt,undefined);assert.equal(rows[0].basis,'publisher_observation');
});
test('Engine series retain order, gaps, negative values, zero and raw precision',()=>{
 const groups=publisherChartGroups([{destination:'financials',status:'publisher_observation',category:'Cash Flow',charts:[{label:'Income Taxes paid',unit:'reported',points:[{year:2024,value:-9730000000,raw:'-9.73 B'},{year:2021,value:0,raw:'0'}]}]}]);
 assert.deepEqual(groups[0].series[0].points.map(p=>p.value),[0,null,null,-9730000000]);
 assert.equal(groups[0].series[0].points[3].raw,'-9.73 B');
});

test('detailed current statements take precedence over rounded summaries and older revisions',()=>{
 const row=(destination:string,value:number,category?:string)=>({destination,status:'publisher_observation',category,financialFields:[{metric:'revenue',year:2024,value}]});
 for(const observations of [[row('overview',21),row('financials',20.94,'Profit/Loss'),row('financials',19,'Profit/Loss')],[row('financials',20.94,'Profit/Loss'),row('overview',21)]]){
  assert.equal(publisherFinancialPeriods(observations)[0].revenue,20.94);
 }
});
test('rejects duplicate years, nonfinite values and unapproved observations',()=>{
 const chart={label:'Tax',unit:'reported',points:[{year:2024,value:1},{year:2024,value:2}]};
 assert.deepEqual(publisherChartGroups([{destination:'financials',status:'publisher_observation',category:'Profit/Loss',charts:[chart]}]),[]);
 assert.deepEqual(publisherChartGroups([{destination:'financials',status:'review_required',category:'Assets',charts:[]}]),[]);
 assert.deepEqual(publisherChartGroups([{destination:'financials',status:'publisher_observation',category:'Assets',charts:[{...chart,points:[{year:2024,value:NaN}]}]}]),[]);
});
