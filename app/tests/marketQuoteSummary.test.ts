import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketQuoteSummary } from '../src/lib/marketQuoteSummary.ts';
const quote=(symbol:string,changePercent:number|null)=>({symbol,exchange:'NSE',lastPrice:10,changePercent,volume:100,timestamp:'2026-10-09T12:00:00Z'} as never);
test('breadth fallback uses actual covered quotes, never zero or invented changes',()=>{
  const result=marketQuoteSummary([quote('SCOM',2),quote('KCB',-1),quote('MISSING',0),quote('EQTY',null)],{SCOM:{sector:'Telecom'},KCB:{sector:'Banking'},EQTY:{sector:'Banking'}});
  assert.equal(result?.coverage,2);assert.equal(result?.advancing,1);assert.equal(result?.declining,1);
  assert.equal(result?.distribution.reduce((s,d)=>s+d.count,0),2);
  assert.match(result!.methodology,/2026-10-09/);
  assert.equal(marketQuoteSummary([],{}),undefined);
});
