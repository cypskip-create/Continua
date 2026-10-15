/** Original research services with fixture-only repositories; no network. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.env.NODE_ENV='test';process.env.CACHE_DRIVER='memory';process.env.LOG_LEVEL='fatal';
process.env.DATABASE_URL='postgresql://fixture:fixture@127.0.0.1:1/fixture';
const {pool}=await import('../../backend/src/storage/db.js');pool.query=()=>{throw Error('Unexpected database call');};
const {candlesRepository}=await import('../../backend/src/storage/repositories/candlesRepository.js');
const {corporateActionsRepository}=await import('../../backend/src/storage/repositories/corporateActionsRepository.js');
const {simulateExecution}=await import('../../backend/src/services/technical/executionSimulation.js');
const {backtestService}=await import('../../backend/src/services/technical/backtestService.js');
const {volumeProfileService}=await import('../../backend/src/services/technical/volumeProfileService.js');
const {guessStatementType,mapRowsToFields,guessFiscalYear,historicalColumnDrafts}=await import('../../backend/src/ingestion/financialsDraft.js');
let count=0;
function compare(a,b,path='root'){
 if(typeof a==='number'&&typeof b==='number'){assert.ok(Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(a),Math.abs(b)),path);return;}
 if(Array.isArray(a)&&Array.isArray(b)){assert.equal(a.length,b.length,path);a.forEach((v,i)=>compare(v,b[i],`${path}.${i}`));return;}
 if(a&&b&&typeof a==='object'&&typeof b==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort(),path);for(const k of Object.keys(a))compare(a[k],b[k],`${path}.${k}`);return;}
 assert.deepEqual(a,b,path);
}
function check(operation,args,expected){
 const p=spawnSync(process.env.NATIVE_PYTHON_BIN??'python3',[fileURLToPath(new URL('../../engine-python/worker.py',import.meta.url))],{input:JSON.stringify({operation,args}),encoding:'utf8',timeout:5000,maxBuffer:4194304,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PYTHONUTF8:'1'}});
 assert.equal(p.status,0,operation);compare(JSON.parse(p.stdout),JSON.parse(JSON.stringify(expected)));count++;
}
try{
 const bars=Array.from({length:120},(_,i)=>{const price=30+Math.sin(i*.4)*5;return {timestamp:new Date(Date.UTC(2024,0,i+1)).toISOString(),open:price,close:price,high:price+1,low:price-1,volume:1e6};});
 for(const fee of [0,20,500])for(const participation of [.00001,.01,.2]){
  const options={initialCapital:100000,feeBps:fee,slippageBps:10,maxVolumeParticipation:participation},signals=bars.map((_,i)=>i%20===0?'buy':i%20===10?'sell':'hold');
  check('simulate_execution',[bars,signals,options],simulateExecution(bars,signals,options));
 }
 for(const data of [[],bars,bars.map(b=>({...b,volume:0})),bars.slice(0,5)]){
  candlesRepository.getCandles=async()=>data;corporateActionsRepository.getBySecurity=async()=>[];
  for(const strategy of ['sma_cross','ema_cross','rsi_reversion']){
   const req={symbol:'KCB',exchange:'NSE',strategy,from:'2024-01-01',to:'2024-12-31',fastPeriod:3,slowPeriod:8,rsiPeriod:5};
   check('backtest',[data,req,[]],await backtestService.run(req));
  }
  check('volume_profile',[data,'KCB','NSE','2024-01-01','2024-12-31'],await volumeProfileService.compute('NSE','KCB','2024-01-01','2024-12-31'));
 }
 for(const rows of [[],[{label:'Revenue',values:['1,200','(200)']},{label:'EPS',values:['2.5','—']}],[{label:'Group revenue',values:['1']},{label:'Company revenue',values:['2']}],[{label:'Total assets',values:['4,000']},{label:'Total liabilities',values:['3,000']}]] ){
  const kind=guessStatementType(rows),candidate={documentTitle:'2024 annual filing',detectedTable:{rows}};
  check('filing_draft',[candidate],{statementType:kind,fiscalYear:guessFiscalYear(candidate.documentTitle),...mapRowsToFields(rows,kind),historicalColumns:historicalColumnDrafts(rows,kind),reviewWarning:'Verify each column’s period, scope and units against the source filing. Drafts are not published facts.'});
 }
 console.log(JSON.stringify({nativeExecutionAndDraftComparisons:count,passed:true,fixtureOnly:true,productionCutover:false}));
}finally{await pool.end();}
