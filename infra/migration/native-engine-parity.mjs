/** Native Python vs existing pure JS oracle. Node is test-only, never a server proxy. */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {computeRatios,yoyGrowth} from '../../backend/src/services/research/ratiosEngine.js';
import {annualRatioAt} from '../../backend/src/services/technical/valuationHistory.js';
import {sma,ema,rsi,macd,latestCrossover} from '../../backend/src/services/technical/indicators.js';
import {portfolioAnalysis,performance,alignedReturns,dailyCloseMap} from '../../backend/src/services/research/enginePortfolio.js';
import {trailingDividendPerShare} from '../../backend/src/services/research/dividendMetrics.js';
import {recordInterest,researchRecommendations,defaultPreferences,EnginePreferencesSchema} from '../../backend/src/services/research/enginePreferences.js';
import {evaluateMonitor,monitoringKinds} from '../../backend/src/services/research/engineMonitoring.js';
import {reportedResearchRatios} from '../../backend/src/services/research/reportedResearch.js';
import {aggregateCandles} from '../../backend/src/services/analytics/candleAggregator.js';
import {legalIssuerIdentity,issuerMastheadMatches} from '../../backend/src/ingestion/normalizers/issuerIdentity.js';
// The publisher module includes a repository import, but only its pure validator
// is invoked. Force an unreachable fixture DSN, never inherited production data.
process.env.NODE_ENV='test';
process.env.DATABASE_URL='postgresql://fixture:fixture@127.0.0.1:1/fixture';
const {sourceFinancialTables}=await import('../../backend/src/services/research/publisherFinancialTables.js');
const python=process.env.NATIVE_PYTHON_BIN??'python3';
const worker=fileURLToPath(new URL('../../engine-python/worker.py',import.meta.url));
const operations={ratios:computeRatios,yoy:yoyGrowth,annual_ratio:annualRatioAt,sma,ema,rsi,macd,crossover:latestCrossover,
 portfolio_analysis:portfolioAnalysis,performance,aligned_returns:alignedReturns,daily_close_map:bars=>Object.fromEntries(dailyCloseMap(bars)),
 trailing_dividend:(actions,now)=>trailingDividendPerShare(actions,new Date(now)),
 record_interest:(settings,symbol,exchange,reset,now)=>recordInterest(settings,symbol,exchange,reset,new Date(now)),
 recommendations:(settings,now)=>researchRecommendations(settings,new Date(now)),evaluate_monitor:evaluateMonitor,
 reported_ratios:(id,quote,history,dividend,now)=>reportedResearchRatios(id,quote,history,dividend,new Date(now)),aggregate_candles:aggregateCandles,source_financial_tables:sourceFinancialTables,issuer_identity:legalIssuerIdentity,issuer_masthead:issuerMastheadMatches,
 validate_preferences:raw=>{const parsed=EnginePreferencesSchema.safeParse(raw);return parsed.success?{valid:true,settings:parsed.data}:{valid:false};}};
const cases=[];
for(const settings of [{},{learnInterests:true,sectors:['  Banking  ','\ufeffTelecom\ufeff']},{learnInterests:'yes'},{unknown:true},{goal:'Speculate'},{interests:[{symbol:'KCB',exchange:'NSE',visits:2,lastSeen:'2026-10-13T10:00:00Z',unknown:'stripped'}]},{interests:[{symbol:'KCB',exchange:'NSE',visits:true}]},{interests:[{symbol:'KCB',exchange:'NSE',visits:10001}]},{interests:[{symbol:'KCB',exchange:'NSE',visits:2,lastSeen:'2026-10-13T10:00:00+03:00'}]},{sectors:['💜'.repeat(31)]},{notifications:null}])cases.push({operation:'validate_preferences',args:[settings]});
for(const name of ['KCB Group PLC','KCB Kenya Limited','Co-operative Bank of Kenya Ltd','A & B Public Limited Company','Alpha Group',''])cases.push({operation:'issuer_identity',args:[name]});
for(const text of ['KCB Group PLC audited annual results','KCB Kenya Ltd annual results','Unrelated\nKCB Group Limited consolidated financial results'])cases.push({operation:'issuer_masthead',args:[text,'KCB Group PLC']});
const table={kind:'publisher_table',tab:'Financials',category:'Profit/Loss',columns:['Metric','2025','2024'],rows:[{label:'Revenue',rowKind:'item',cells:[{raw:'1.00 B'},{raw:'900 M'}]}]};
for(const mutation of ['valid','future','duplicate','cells','group','unicode']){
 const t=structuredClone(table);if(mutation==='future')t.columns[1]='2099';if(mutation==='duplicate')t.columns[1]='2024';if(mutation==='cells')t.rows[0].cells=[];if(mutation==='group'){t.rows[0].rowKind='group';t.rows[0].cells=[];}if(mutation==='unicode')t.rows[0].label='💜'.repeat(251);
 cases.push({operation:'source_financial_tables',args:[[t]]});
}
for(const interval of ['1m','5m','15m','1h','1d','1w','1M','1y']){
 cases.push({operation:'aggregate_candles',args:[[],interval]});
 const dates=['2024-02-28T12:00:00Z','2024-02-29T12:00:00Z','2024-03-01T12:00:00Z','2024-03-03T12:00:00Z','2024-03-04T12:00:00Z','2024-12-31T12:00:00Z','2025-01-01T12:00:00Z'];
 for(const mixed of [false,true])cases.push({operation:'aggregate_candles',args:[dates.map((timestamp,i)=>({securityId:'NSE:COOP',interval:'1d',timestamp,open:20+i,close:21+i,high:22+i,low:19+i,volume:100+i,sourceUrl:mixed&&i%2?'https://fixture.example/b':'https://fixture.example/a'})).reverse(),interval]});
}
let seed=123456;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let batch=0;batch<12;batch++){
 const candles=Array.from({length:batch*7},(_,i)=>({close:20+random()*10,timestamp:`2026-01-${String(i%28+1).padStart(2,'0')}`}));
 for(const operation of ['sma','ema','rsi'])cases.push({operation,args:[candles,7]});
 cases.push({operation:'macd',args:[candles,3,8,5]});
 cases.push({operation:'ratios',args:[{price:30,sharesOutstanding:1000,revenue:30000,netIncome:batch%2?-1500:2000,totalAssets:80000,totalEquity:20000,totalDebt:1000,cash:400,eps:batch%3===0?null:2,priceHistory90d:candles.map(c=>c.close)}]});
}
for(const input of [{price:30},{price:30,sharesOutstanding:0,totalEquity:0,revenue:0,netIncome:0},{price:30,sharesOutstanding:1000,eps:0,priceHistory90d:[0,10,20]},{price:30,sharesOutstanding:1000,eps:-2,priceHistory90d:[10,10,10]}])cases.push({operation:'ratios',args:[input]});
const periods=[{fiscalYear:2024,periodEnd:'2024-12-31',reportedAt:'2025-03-01',eps:2,sharesOutstanding:1000,totalEquity:10000,revenue:30000,sourceUrls:['https://fixture.example/filing.pdf']},{fiscalYear:2025,periodEnd:'2025-12-31',reportedAt:'2026-03-01',eps:4,sharesOutstanding:1200,totalEquity:12000,revenue:36000}];
for(const at of ['2024-01-01','2025-02-28','2025-03-01','2026-02-28','2026-03-01'])for(const ratio of ['pe','pb','ps'])cases.push({operation:'annual_ratio',args:[periods,30,at,ratio]});
for(const args of [[null,null],[1,-1],[0,0],[12,10]])cases.push({operation:'yoy',args});
for(const args of [[[1,2],[2,1]],[[2,1],[1,2]],[[null,1],[2,0]],[[1,2],[1]]])cases.push({operation:'crossover',args});
cases.push({operation:'rsi',args:[Array.from({length:20},()=>({close:10})),14]});
const now='2026-10-13T10:00:00.000Z';
for(const learn of [false,true]){
 const settings={...defaultPreferences(),learnInterests:learn,interests:[{symbol:'SCOM',exchange:'NSE',visits:2,lastSeen:'2026-10-12T09:00:00.000Z'},{symbol:'KCB',exchange:'NSE',visits:100,lastSeen:'2025-01-01T00:00:00.000Z'}]};
 for(const reset of [false,true])cases.push({operation:'record_interest',args:[settings,'SCOM','NSE',reset,now]});
 cases.push({operation:'recommendations',args:[settings,now]});
 cases.push({operation:'record_interest',args:[{...settings,interests:[]},'EQTY','NSE',false,now]});
}
for(const kind of monitoringKinds)for(const quoteFresh of [false,true])cases.push({operation:'evaluate_monitor',args:[{kind,threshold:10,last_state:{triggered:false,fingerprint:'old'}},{fingerprint:'new',material:true,quoteFresh,price:9,debt:11,growth:4,earningsGrowth:3,cashConversion:null,dividendPayout:12,quoteAge:11}]});
for(const positions of [[],[{symbol:'SCOM',shares:100,price:null,sector:'Telecom',currency:'KES'}],[{symbol:'SCOM',shares:100,price:30,change:1,volume:500,asOf:'2026-10-12T10:00:00.000Z',sector:'Telecom',currency:'KES'},{symbol:'KCB',shares:50,price:90,change:-1,volume:10000,asOf:'2026-10-12T11:00:00.000Z',sector:'Banking',currency:'KES'}],[{symbol:'A',shares:1,price:10,sector:'Test',currency:'KES'},{symbol:'B',shares:1,price:20,sector:'Test',currency:'USD'}]])cases.push({operation:'portfolio_analysis',args:[positions]});
for(const points of [[],[{date:'2026-01-01',value:100,flow:0},{date:'2026-02-01',value:120,flow:10},{date:'2026-03-01',value:125,flow:0}],[{date:'2026-01-01',value:0,flow:0},{date:'2026-02-01',value:100,flow:10}]])cases.push({operation:'performance',args:[points]});
const bars=Array.from({length:40},(_,i)=>({timestamp:new Date(Date.UTC(2026,0,i+1,12)).toISOString(),close:20+i%7}));
cases.push({operation:'daily_close_map',args:[[...bars,{timestamp:'invalid',close:10},{timestamp:'2026-01-01T14:00:00.000Z',close:25}]]});
cases.push({operation:'aligned_returns',args:[{SCOM:bars,KCB:bars.map((b,i)=>({...b,close:30+i%11}))}]});
for(const date of [now,'2024-02-29T10:00:00.000Z'])cases.push({operation:'trailing_dividend',args:[[{exDate:'2026-05-01',status:'confirmed',details:{type:'dividend',amountPerShare:1.2}},{exDate:'2026-07-01',status:'cancelled',details:{type:'dividend',amountPerShare:2}},{exDate:'2025-01-01',details:{type:'dividend',amountPerShare:.5}}],date]});
for(const source of ['verified','mock'])cases.push({operation:'reported_ratios',args:['NSE:SCOM',{lastPrice:30,timestamp:'2026-02-01T10:00:00.000Z',source},periods,1.2,now]});
function compare(a,b,where='root'){
 if(typeof a==='number'&&typeof b==='number'){if(Math.abs(a-b)>1e-8*Math.max(1,Math.abs(a)))throw new Error(`Numerical parity failed at ${where}`);return;}
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object'){if(a!==b)throw new Error(`Value parity failed at ${where}`);return;}
 const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();if(JSON.stringify(ak)!==JSON.stringify(bk))throw new Error(`Missing-field/shape parity failed at ${where}`);
 for(const k of ak)compare(a[k],b[k],`${where}.${k}`);
}
for(const c of cases){
 const expected=JSON.parse(JSON.stringify(operations[c.operation](...c.args)??null));
 const execution=spawnSync(python,[worker],{input:JSON.stringify(c),encoding:'utf8',timeout:5000,maxBuffer:4194304,
  env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PYTHONUTF8:'1'}});
 if(execution.status!==0)throw new Error(`Python calculation failed: ${c.operation}`);
 compare(expected,JSON.parse(execution.stdout),c.operation);
}
console.log(JSON.stringify({nativePythonParityCases:cases.length,operations:Object.keys(operations),passed:true,productionCutover:false}));
