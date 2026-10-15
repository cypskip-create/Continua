/** Execute the original company-bundle assembly with fixture-only repositories. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.env.NODE_ENV='test';process.env.CACHE_DRIVER='memory';process.env.LOG_LEVEL='fatal';
process.env.DATABASE_URL='postgresql://fixture:fixture@127.0.0.1:1/fixture';
process.env.ENGINE_CALCULATION_RUNTIME='node';
process.env.PAYSTACK_SECRET_KEY='';process.env.PAYSTACK_TEST_SECRET_KEY='';process.env.OPENAI_API_KEY='';
const RealDate=Date,instant='2026-10-13T12:00:00.000Z';
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return RealDate.parse(instant);}};
const {pool}=await import('../../backend/src/storage/db.js');
pool.query=()=>{throw new Error('Unexpected database access in bundle fixture');};
const {securitiesRepository}=await import('../../backend/src/storage/repositories/securitiesRepository.js');
const {pricesRepository}=await import('../../backend/src/storage/repositories/pricesRepository.js');
const {financialsRepository}=await import('../../backend/src/storage/repositories/financialsRepository.js');
const {corporateActionsRepository}=await import('../../backend/src/storage/repositories/corporateActionsRepository.js');
const {valuationService}=await import('../../backend/src/services/technical/valuationService.js');
const {newsRepository}=await import('../../backend/src/storage/repositories/newsRepository.js');
const {indicatorsService}=await import('../../backend/src/services/technical/indicatorsService.js');
const {engineRepository}=await import('../../backend/src/storage/repositories/engineRepository.js');
const {getEngineBundle}=await import('../../backend/src/services/research/engineBundle.js');
const baseline={baseline:true,changes:[],fingerprint:'',comparedAsOf:null};
const annual=year=>({fiscalYear:year,periodEnd:`${year}-12-31`,reportedAt:`${year+1}-03-01`,revenue:100+(year-2024)*20,netIncome:20,eps:6,sourceUrls:['https://issuer.example/a.pdf']});
let count=0;
try{
 for(const scenario of ['complete','missing','partial','sparse']){
  const symbol='FIX'+scenario.toUpperCase();
  const input={symbol,exchange:'NSE',profile:{id:`NSE:${symbol}`,currency:'KES',company:{name:'Example Issuer PLC',sectorName:'Banking'}},
   quote:scenario==='missing'?null:{lastPrice:30,timestamp:'2026-10-12T12:00:00.000Z',source:'live'},
   history:scenario==='missing'?[]:scenario==='sparse'?[annual(2021),annual(2025)]:[annual(2024),annual(2025)],quarterly:[],earnings:[],ownership:[],valuation:null,
   news:[{id:'1',headline:'Company financial results',needsReview:false,excerpt:'The company did not increase earnings in the latest reporting period.',sourceName:'Fixture publisher',articleUrl:'https://issuer.example/news',publishedAt:'2026-10-12T12:00:00.000Z',impact:null}],
   technicals:[],actions:[],articles:{'1':{content:'The company did not increase earnings in the latest reporting period.'}},unavailable:scenario==='partial'?['Ownership']:[]};
  securitiesRepository.getCompanyProfile=async()=>input.profile;
  pricesRepository.getQuote=async()=>input.quote;
  financialsRepository.getHistoricalPeriods=async(_id,type)=>type==='annual'?input.history:input.quarterly;
  corporateActionsRepository.getEarningsBySecurity=async()=>input.earnings;
  corporateActionsRepository.getOwnership=async()=>{if(scenario==='partial')throw new Error('Fixture section outage');return input.ownership;};
  corporateActionsRepository.getBySecurity=async()=>input.actions;
  valuationService.compute=async()=>input.valuation;
  newsRepository.listBySecurity=async()=>input.news;newsRepository.getById=async id=>input.articles[id]??null;
  indicatorsService.compute=async()=>null;
  let expectedState;
  engineRepository.observe=async(_id,state)=>{expectedState=state;return baseline;};
  const expected=JSON.parse(JSON.stringify(await getEngineBundle(symbol,'NSE')));
  const child=spawnSync(process.env.NATIVE_PYTHON_BIN??'python3',[fileURLToPath(new URL('../../engine-python/worker.py',import.meta.url))],{
   input:JSON.stringify({operation:'assemble_company_bundle',args:[input,instant]}),encoding:'utf8',timeout:5000,maxBuffer:4194304,
   env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PYTHONUTF8:'1'}});
  assert.equal(child.status,0,`Native bundle failed: ${scenario}`);
  const native=JSON.parse(child.stdout);
  assert.deepEqual(native.bundle,expected,`Native bundle shape/evidence mismatch: ${scenario}`);
  assert.equal(native.observeEligible,scenario!=='partial');
  if(expectedState)assert.deepEqual(native.state,expectedState,`Native source snapshot mismatch: ${scenario}`);
  count++;
 }
 console.log(JSON.stringify({nativeCompanyBundleParityCases:count,passed:true,fixtureOnly:true,productionCutover:false}));
}finally{globalThis.Date=RealDate;await pool.end();}
