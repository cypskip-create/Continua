import assert from 'node:assert/strict';
import {test} from 'node:test';
import {publisherChartGroups} from '../src/lib/publisherCharts.ts';
test('Engine series retain order, gaps, negative values, zero and raw precision',()=>{
 const groups=publisherChartGroups([{destination:'financials',status:'publisher_observation',category:'Cash Flow',charts:[{label:'Income Taxes paid',unit:'reported',points:[{year:2024,value:-9730000000,raw:'-9.73 B'},{year:2021,value:0,raw:'0'}]}]}]);
 assert.deepEqual(groups[0].series[0].points.map(p=>p.value),[0,null,null,-9730000000]);
 assert.equal(groups[0].series[0].points[3].raw,'-9.73 B');
});
test('rejects duplicate years, nonfinite values and unapproved observations',()=>{
 const chart={label:'Tax',unit:'reported',points:[{year:2024,value:1},{year:2024,value:2}]};
 assert.deepEqual(publisherChartGroups([{destination:'financials',status:'publisher_observation',category:'Profit/Loss',charts:[chart]}]),[]);
 assert.deepEqual(publisherChartGroups([{destination:'financials',status:'review_required',category:'Assets',charts:[]}]),[]);
 assert.deepEqual(publisherChartGroups([{destination:'financials',status:'publisher_observation',category:'Assets',charts:[{...chart,points:[{year:2024,value:NaN}]}]}]),[]);
});
