import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {marketStatistics} from '../../backend/src/services/marketData/marketStatistics.js';
const now='2026-10-19T12:00:00.000Z',day=86400000;
const history=[{fiscalYear:2025,periodEnd:'2025-12-31',reportedAt:'2026-03-01',currency:'KES',sharesOutstanding:100,netIncome:600,sourceUrls:['https://example.com/filing']}];
const quote={lastPrice:30,timestamp:'2026-10-19T10:00:00.000Z',currency:'KES',volume:0};
const closes=Array.from({length:366},(_,i)=>({date:new Date(Date.parse(now)-i*day).toISOString().slice(0,10),close:20+i/10}));
const series=[[],closes,closes.slice(0,100),closes.filter((_,i)=>i<20||i>40),[...closes,{...closes[0],close:99}],closes.slice(10)];
let cases=0;
for(const q of [null,quote,{...quote,source:'mock'},{...quote,timestamp:'2027-01-01T00:00:00Z'},{...quote,marketCap:999},{...quote,volume:null}]) {
 for(const h of [[],history,[{...history[0],currency:'USD'}],[{...history[0],reportedAt:'2027-01-01'}],[{...history[0],sharesOutstanding:-100}],[{...history[0],eps:0}]]) {
  for(const c of series) {
   const candles=cases%2?c.map(r=>({timestamp:r.date,close:r.close,high:r.close+1,low:r.close-1})):[];
   const args=[q,h,candles,c,now];
   const child=spawnSync(process.env.NATIVE_PYTHON_BIN??'python3',[fileURLToPath(new URL('../../engine-python/worker.py',import.meta.url))],{input:JSON.stringify({operation:'market_statistics',args}),encoding:'utf8',timeout:5000,maxBuffer:4194304,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PYTHONUTF8:'1'}});
   assert.equal(child.status,0,child.stderr);
   assert.deepEqual(JSON.parse(child.stdout),marketStatistics(q,h,candles,c,new Date(now)),`statistics case ${cases}`);
   cases++;
  }
 }
}
console.log(JSON.stringify({nativeStatisticsParityCases:cases,passed:true,fixtureOnly:true,productionCutover:false}));
