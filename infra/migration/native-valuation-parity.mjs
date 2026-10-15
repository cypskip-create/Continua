/** Execute original valuation service with fixture-only repositories. */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.env.NODE_ENV='test';process.env.CACHE_DRIVER='memory';process.env.LOG_LEVEL='fatal';
process.env.DATABASE_URL='postgresql://fixture:fixture@127.0.0.1:1/fixture';
const RealDate=Date,instant='2026-10-13T12:00:00.000Z';
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return RealDate.parse(instant);}};
const {pool}=await import('../../backend/src/storage/db.js');pool.query=()=>{throw new Error('Unexpected valuation database query');};
const {scoresRepository}=await import('../../backend/src/storage/repositories/scoresRepository.js');
const {valuationService,relativeValuationModel,dividendDiscountModel}=await import('../../backend/src/services/technical/valuationService.js');
const {securitiesRepository}=await import('../../backend/src/storage/repositories/securitiesRepository.js');
const {pricesRepository}=await import('../../backend/src/storage/repositories/pricesRepository.js');
const {financialsRepository}=await import('../../backend/src/storage/repositories/financialsRepository.js');
const {corporateActionsRepository}=await import('../../backend/src/storage/repositories/corporateActionsRepository.js');
let count=0;
function check(operation,args,expected){
 const execution=spawnSync(process.env.NATIVE_PYTHON_BIN??'python3',[fileURLToPath(new URL('../../engine-python/worker.py',import.meta.url))],{
  input:JSON.stringify({operation,args}),encoding:'utf8',timeout:5000,maxBuffer:4194304,
  env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PYTHONUTF8:'1'}});
 assert.equal(execution.status,0,`Native valuation failed: ${operation}`);
 assert.deepEqual(JSON.parse(execution.stdout),JSON.parse(JSON.stringify(expected)),`Native valuation parity: ${operation}`);count++;
}
const financial={fiscalYear:2025,reportedAt:'2026-03-01',periodEnd:'2025-12-31',eps:6,netIncome:600,sharesOutstanding:100,totalEquity:1000};
const dividend=(date,amount,status='confirmed')=>({exDate:date,announcedAt:date,status,details:{type:'dividend',amountPerShare:amount}});
try{
 for(const f of [null,financial,{...financial,eps:null},{...financial,eps:-1}])for(const sector of [{avgPe:null,sampleSize:0},{avgPe:7.73,sampleSize:2},{avgPe:7.73,sampleSize:3}]){
  scoresRepository.getSectorAverageRatios=async()=>sector;
  check('relative_valuation',[30,f,'banking',sector],await relativeValuationModel('NSE','NSE:KCB','banking',30,f));
 }
 for(const payouts of [[],[dividend('2026-05-01',2)],[dividend('2026-05-01',2),dividend('2025-05-01',1.8)],[dividend('2026-05-01',0),dividend('2025-05-01',2)],[dividend('2026-05-01',2,'cancelled'),dividend('2025-05-01',2)]])for(const now of [instant,'2024-02-29T12:00:00.000Z'])check('dividend_discount',[30,payouts,now],dividendDiscountModel(30,payouts,new Date(now)));
 for(const f of [null,financial,{...financial,reportedAt:'2027-03-01'},{...financial,eps:null,sharesOutstanding:0}]){
  const quote={lastPrice:30,timestamp:'2026-10-12T12:00:00.000Z',currency:'KES'},payouts=[dividend('2026-05-01',2),dividend('2025-05-01',1.8)],sector={avgPe:7.73,sampleSize:3};
  securitiesRepository.getCompanyProfile=async()=>({company:{sectorId:'banking'}});pricesRepository.getQuote=async()=>quote;
  financialsRepository.getLatestPeriodBundle=async()=>f;corporateActionsRepository.getDividendsBySecurity=async()=>payouts;scoresRepository.getSectorAverageRatios=async()=>sector;
  check('valuation_bundle',['KCB','NSE',quote,f,payouts,'banking',sector,instant],await valuationService.compute('NSE','KCB'));
 }
 console.log(JSON.stringify({nativeValuationParityCases:count,passed:true,fixtureOnly:true,productionCutover:false}));
}finally{globalThis.Date=RealDate;await pool.end();}
