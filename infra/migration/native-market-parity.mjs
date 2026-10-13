/** Owned-database, read-only native API vs legacy repository contracts.
 * No background jobs, user tokens, charges or publication writes are invoked.
 */
import dotenv from '../../backend/node_modules/dotenv/lib/main.js';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
dotenv.config({path:fileURLToPath(new URL('../../backend/.env.local',import.meta.url)),quiet:true});
const connection=process.env.DATABASE_URL;
let owned;try{owned=new URL(connection??'https://invalid.test');}catch{throw new Error('Owned database connection unavailable');}
if(!owned.username.includes('jjsetogmnumoudrovpzn')&&!owned.hostname.includes('jjsetogmnumoudrovpzn'))throw new Error('Owned database connection unavailable');
// The oracle repository uses production evidence filters, but no production
// server or worker is started. Provider/scraper capabilities are disabled.
process.env.NODE_ENV='production';process.env.CACHE_DRIVER='memory';
process.env.PAYSTACK_LIVE_CHECKOUT_ENABLED='false';process.env.PAYSTACK_NATIVE_ENABLED='false';
process.env.PAYSTACK_CARD_RENEWAL_ENABLED='false';process.env.LOG_LEVEL='fatal';
const {securitiesRepository}=await import('../../backend/src/storage/repositories/securitiesRepository.js');
const {candlesRepository}=await import('../../backend/src/storage/repositories/candlesRepository.js');
const {financialsRepository}=await import('../../backend/src/storage/repositories/financialsRepository.js');
const {indicesRepository}=await import('../../backend/src/storage/repositories/indicesRepository.js');
const {publisherFinancialTables}=await import('../../backend/src/services/research/publisherFinancialTables.js');
const {aggregateCandles}=await import('../../backend/src/services/analytics/candleAggregator.js');
const {pool}=await import('../../backend/src/storage/db.js');
const revision='native-read-contract-'+randomUUID();
const python=process.env.NATIVE_PYTHON_BIN;
if(!python)throw new Error('Set NATIVE_PYTHON_BIN to the existing Python runtime');
const child=spawn(fileURLToPath(new URL('../../.qa-artifacts/continua-native.exe',import.meta.url)),[],{windowsHide:true,stdio:'ignore',env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,DATABASE_URL:connection,DEV_API_KEY:'fixture-native-read-only',NODE_ENV:'development',NATIVE_PYTHON_BIN:python,NATIVE_PYTHON_SCRIPT:fileURLToPath(new URL('../../engine-python/worker.py',import.meta.url)),NATIVE_CANDIDATE_REVISION:revision}});
let failedStart=false;child.once('error',()=>{failedStart=true;});child.once('exit',()=>{failedStart=true;});
const origin='http://127.0.0.1:4080';
const checks=[];
function normalized(value){return JSON.parse(JSON.stringify(value));}
function compare(a,b,at='root'){
 if(typeof a==='number'&&typeof b==='number'){if(Math.abs(a-b)>1e-8*Math.max(1,Math.abs(a)))throw new Error(`Native numeric read mismatch: ${at}`);return;}
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object'){if(a!==b)throw new Error(`Native read value mismatch: ${at}`);return;}
 const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();if(JSON.stringify(ak)!==JSON.stringify(bk))throw new Error(`Native read shape mismatch: ${at}`);
 for(const key of ak)compare(a[key],b[key],`${at}.${key}`);
}
async function check(path,expected,status=200){const response=await fetch(origin+path,{headers:{'X-API-Key':'fixture-native-read-only'},signal:AbortSignal.timeout(20000)});const body=await response.json();if(response.status!==status)throw new Error(`Native read status mismatch: ${path}`);if(status===200)compare(normalized(expected),body.data,path);checks.push({path,status,passed:true});}
try{
 let ready=false;for(let attempt=0;attempt<30&&!failedStart;attempt++){try{const r=await fetch(origin+'/api/v1/health/live',{signal:AbortSignal.timeout(1000)});ready=(await r.json()).revision===revision;if(ready)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 if(!ready)throw new Error('Unique native candidate did not start');
 await check('/api/v1/indices',await indicesRepository.listByExchange('NSE'));
 await check('/api/v1/instruments',await securitiesRepository.listInstruments('NSE'));
 await check('/api/v1/sectors',await securitiesRepository.listSectors());
 const symbols=['COOP','KCB','SCOM'];
 const securities=await securitiesRepository.getBySymbols('NSE',symbols);
 const batch=await candlesRepository.getRecentClosesBatch(securities.map(s=>s.id),20);
 const lines={};for(const s of securities){const rows=batch.get(s.id);if(rows?.length)lines[s.symbol]=rows.map(r=>r.close);}
 await check('/api/v1/historical/sparklines?symbols=COOP,KCB,SCOM&points=20',lines);
 for(const symbol of symbols){
  const security=securities.find(s=>s.symbol===symbol);if(!security)throw new Error('Expected NSE security unavailable');
  await check(`/api/v1/companies/${symbol}`,await securitiesRepository.getCompanyProfile('NSE',symbol));
  const latest=await financialsRepository.getLatestPeriodBundle(security.id,'annual');
  await check(`/api/v1/financials/${symbol}`,latest,latest?200:404);
  await check(`/api/v1/financials/${symbol}/history?limit=5`,await financialsRepository.getHistoricalPeriods(security.id,'annual',5));
  await check(`/api/v1/financials/${symbol}/publisher-tables`,await publisherFinancialTables(symbol));
  const from='2025-01-01T00:00:00.000Z',to='2026-10-13T00:00:00.000Z';
  const daily=await candlesRepository.getCandles(security.id,'1d',from,to);
  await check(`/api/v1/historical/${symbol}?from=${from}&to=${to}`,daily);
  for(const interval of ['1w','1M','1y'])await check(`/api/v1/historical/${symbol}?interval=${interval}&from=${from}&to=${to}`,aggregateCandles(daily,interval).filter(b=>new Date(b.timestamp)>=new Date(from)));
 }
 console.log(JSON.stringify({nativeMarketReadComparisons:checks.length,ownedDatabaseReads:true,passed:true,productionCutover:false,checks}));
}finally{child.kill();await pool.end();}
