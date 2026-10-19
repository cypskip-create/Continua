/** Native Python vs existing pure JS oracle. Node is test-only, never a server proxy. */
import './native-fixture-env.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {computeRatios,yoyGrowth} from '../../backend/src/services/research/ratiosEngine.js';
import {annualRatioAt} from '../../backend/src/services/technical/valuationHistory.js';
import {sma,ema,rsi,macd,latestCrossover} from '../../backend/src/services/technical/indicators.js';
import {portfolioAnalysis,performance,alignedReturns,dailyCloseMap} from '../../backend/src/services/research/enginePortfolio.js';
import {portfolioRisk} from '../../backend/src/services/research/enginePortfolioRisk.js';
import {riskContributions,totalReturnSeries} from '../../backend/src/services/research/engineRiskLab.js';
import {analyzeFinancials,dataQuality,scenarios,fingerprint,changesBetween} from '../../backend/src/services/research/engineAnalytics.js';
import {researchReadiness} from '../../backend/src/services/research/researchReadiness.js';
import {computeAfriScore} from '../../backend/src/services/research/afriScore.js';
import {companyDiagnostics} from '../../backend/src/services/research/companyDiagnostics.js';
import {summarizeNews} from '../../backend/src/services/research/newsDigest.js';
import {analyzeNewsIssuers,articleEvidenceText} from '../../backend/src/services/research/newsRelevance.js';
import {cleanArticleContent,dedupeNewsItems,isFinancialNews} from '../../backend/src/domain/newsQuality.js';
import {newsImpact} from '../../backend/src/services/research/newsImpact.js';
import {classifyNewsCategory} from '../../backend/src/ingestion/entityResolution/classifyNewsCategory.js';
import {buildCompanyBriefing} from '../../backend/src/services/research/engineBriefing.js';
import {buildResearchSynthesis} from '../../backend/src/services/research/engineSynthesis.js';
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
const {HistoricalConfirmSchema}=await import('../../backend/src/ingestion/confirmHistoricalColumns.js');
const {validateNativeAnnualReport}=await import('../../backend/src/ingestion/normalizers/nativeAnnualReport.js');
const python=process.env.NATIVE_PYTHON_BIN??'python3';
const worker=fileURLToPath(new URL('../../engine-python/worker.py',import.meta.url));
const operations={ratios:computeRatios,yoy:yoyGrowth,annual_ratio:annualRatioAt,sma,ema,rsi,macd,crossover:latestCrossover,
 analyze_financials:analyzeFinancials,data_quality:(quote,rows,now)=>dataQuality(quote,rows,new Date(now)),scenarios,company_briefing:buildCompanyBriefing,research_synthesis:buildResearchSynthesis,
 research_readiness:(input,now)=>researchReadiness(input,new Date(now)),evidence_fingerprint:fingerprint,changes_between:changesBetween,
 afri_score:computeAfriScore,company_diagnostics:companyDiagnostics,summarize_news:summarizeNews,
 analyze_news_issuers:analyzeNewsIssuers,article_evidence_text:articleEvidenceText,clean_article_content:cleanArticleContent,
 dedupe_news:dedupeNewsItems,is_financial_news:isFinancialNews,news_impact:newsImpact,
 portfolio_analysis:portfolioAnalysis,portfolio_risk:portfolioRisk,risk_contributions:riskContributions,total_return_series:totalReturnSeries,performance,aligned_returns:alignedReturns,daily_close_map:bars=>Object.fromEntries(dailyCloseMap(bars)),
 trailing_dividend:(actions,now)=>trailingDividendPerShare(actions,new Date(now)),
 record_interest:(settings,symbol,exchange,reset,now)=>recordInterest(settings,symbol,exchange,reset,new Date(now)),
 recommendations:(settings,now)=>researchRecommendations(settings,new Date(now)),evaluate_monitor:evaluateMonitor,
 reported_ratios:(id,quote,history,dividend,now)=>reportedResearchRatios(id,quote,history,dividend,new Date(now)),aggregate_candles:aggregateCandles,source_financial_tables:sourceFinancialTables,issuer_identity:legalIssuerIdentity,issuer_masthead:issuerMastheadMatches,
 validate_preferences:raw=>{const parsed=EnginePreferencesSchema.safeParse(raw);return parsed.success?{valid:true,settings:parsed.data}:{valid:false};},
 validate_historical_confirmation:raw=>{const parsed=HistoricalConfirmSchema.safeParse(raw);return parsed.success?{valid:true,data:parsed.data}:{valid:false};},native_annual_report:validateNativeAnnualReport};
operations.classify_news_category=classifyNewsCategory;
const cases=[];
for(const text of ['profit board','Treasury inflation budget','appoints CEO to board','Unclassified literal prose','EPS pre-tax profit annual results','central bank monetary policy and housing rent','earnings inflation CEO','PARTNERSHIP rights issue restructuring','dividend shilling','revenue fell merger','', 'real estate construction mortgage'])cases.push({operation:'classify_news_category',args:[text]});
const directory=[['SCOM','Safaricom PLC'],['WRONG','Safaricom Limited'],['KCB','KCB Group PLC'],['EQTY','Equity Group Holdings Limited'],['KPLC','Kenya Power and Lighting Company PLC'],['KQ','Kenya Airways PLC'],['NSE','Nairobi Securities Exchange PLC'],['TOTL','TotalEnergies Marketing Kenya PLC'],['JUB','Jubilee Holdings Limited']].map(([symbol,companyName])=>({symbol,companyName,securityId:`NSE:${symbol}`}));
for(const [headline,raw] of [['M-Pesa expands mobile money services','Safaricom has expanded its mobile money services for customers.'],['Equity in society','The concept of equity in society does not establish issuer evidence.'],['KCB Group reports a dividend','The bank has declared its annual dividend to shareholders.'],['Kenya Airways passenger dies','A passenger dies during a Kenya Airways flight and investigations continue.'],['NSE market statistics','The Nairobi Securities Exchange index recorded a rise in market turnover.'],['NSE PLC reports higher profit','The Nairobi Securities Exchange PLC reports higher annual profit.'],['Unrelated headline','Unrelated headline\nThe company discussed its strategy and production capacity.\nRelated stories\nSafaricom grew its annual revenue significantly in the prior period.'],['Issuer results','Issuer results\nSCOM KES 30.00 KCB KES 90.00 share prices market watch.\nKenya Power has announced updated electricity tariffs for customers.'],['KCB partnership','KCB Group and Equity Bank and Safaricom and Kenya Power signed a business partnership.']]){
 cases.push({operation:'analyze_news_issuers',args:[headline,raw,directory]});
 cases.push({operation:'article_evidence_text',args:[headline,raw]});
 cases.push({operation:'clean_article_content',args:[headline,raw]});
 for(const linked of [false,true])cases.push({operation:'is_financial_news',args:[headline,raw,linked]});
 for(const symbols of [[],['KCB']])cases.push({operation:'news_impact',args:[headline,raw,symbols]});
}
const receipts=[{headline:'Bank profits increase',articleUrl:'https://www.publisher.example/results?track=1',content:null,excerpt:'Short excerpt',symbols:['WRONG'],securityIds:['NSE:WRONG']},{headline:'Bank profits increase!',articleUrl:'https://publisher.example/results/',content:'A more complete verified source receipt containing actual issuer evidence.',excerpt:null,symbols:['KCB'],securityIds:['NSE:KCB']}];
cases.push({operation:'dedupe_news',args:[receipts]});
cases.push({operation:'dedupe_news',args:[receipts.toReversed()]});
for(const ratios of [{},{pe:5,pb:.5,evEbitda:4,currentRatio:2.5,debtToEquity:0,interestCoverage:10,dividendYield:.1,payoutRatio:.4,volatility90d:.15,roe:.3,roa:.15,netMargin:.3,priceMomentum3m:.3},{pe:100,pb:8,debtToEquity:3,roe:-1,dividendYield:0},{pe:13.96,pb:2.17,debtToEquity:.714,netMargin:.125}])for(const growth of [null,-.1,0,.3])cases.push({operation:'afri_score',args:['NSE:KCB',{ratios,revenueGrowthYoy:growth,epsGrowthYoy:growth}]});
for(const rows of [[],[{fiscalYear:2025,revenue:0,netIncome:0}],[{fiscalYear:2021,revenue:100,netIncome:10},{fiscalYear:2025,revenue:120,netIncome:20}],[{fiscalYear:2024,revenue:100,netIncome:10,sharesOutstanding:100,totalDebt:10,totalEquity:20},{fiscalYear:2025,revenue:120,netIncome:-20,sharesOutstanding:110,totalDebt:30,totalEquity:20,operatingCashFlow:0,currentAssets:10,currentLiabilities:20,sourceUrls:['https://fixture.example/a']} ]])cases.push({operation:'company_diagnostics',args:[rows]});
for(const args of [['Headline',null,null],['Headline','', ' Publisher excerpt '],['Reported profit did not grow.','Reported profit did not grow. Revenue decreased compared with the earlier period. The company did not raise its dividend. This is another long source sentence that remains unchanged.',null],['No fabrication','<p>Company revenue has not increased in the latest annual period.</p> <p>Debt has risen and cash flow is negative.</p>',null],['Short','short.', 'Fallback excerpt'],['Unicode','💜'.repeat(260)+' earnings.',null]])cases.push({operation:'summarize_news',args});
const annualRow=year=>({fiscalYear:year,periodEnd:`${year}-12-31`,reportedAt:`${year+1}-03-01`,eps:6,revenue:100,netIncome:20,sourceUrls:['https://issuer.example/report.pdf']});
for(const history of [[],[annualRow(2024),annualRow(2025)],[annualRow(2017),annualRow(2024)],[{...annualRow(2026),sourceUrls:[]}],[annualRow(2025),annualRow(2025)],[{...annualRow(2025),revenue:0,eps:null}]])for(const quote of [null,{lastPrice:90,timestamp:'2026-10-09T12:00:00Z',source:'live'},{lastPrice:0,timestamp:'2026-10-09T12:00:00Z',source:'mock'},{lastPrice:90,timestamp:'2026-09-09T12:00:00Z'}])cases.push({operation:'research_readiness',args:[{quote,history,unavailable:['Estimates','Estimates'],technicalObservations:34,estimateCount:0,ownershipCount:1},'2026-10-13T12:00:00Z']});
for(const value of [0,-0,1.25,-1.25,1e-7,1e-6,1e20,1e21,123456789.12345679,5e-324,1.7976931348623157e308])cases.push({operation:'evidence_fingerprint',args:[{value,label:'💜',lone:'\ud800',nested:{'20':value,'2':null}}]});
const baseline={fiscalYear:2024,revenue:100,netIncome:-10,debtToEquity:null,fairValue:20,newsIds:['a'],ownership:[{name:'Example holder',percent:1.125}]};
for(const previous of [null,baseline])for(const current of [baseline,{...baseline,fiscalYear:2025,revenue:105,netIncome:-5,debtToEquity:0,fairValue:19,newsIds:['a','b'],ownership:[{name:'Example holder',percent:2.125}]},{newsIds:[],ownership:[]}])cases.push({operation:'changes_between',args:[previous,current]});
for(const latest of [null,{fiscalYear:2025,revenue:120,netIncome:-5,eps:1.25},{fiscalYear:2023,revenue:120},{fiscalYear:2025,revenue:0,netIncome:0,eps:0}]){
 for(const prior of [null,{fiscalYear:2024,revenue:100,netIncome:-10,eps:1},{fiscalYear:2021,revenue:10},{fiscalYear:2024,revenue:0,netIncome:0,eps:0}]){
  for(const ratios of [null,{roe:.1225,netMargin:-.075,debtToEquity:1.25,dividendYield:.041},{roe:0,debtToEquity:1}])cases.push({operation:'company_briefing',args:[{symbol:'COOP',latest,prior,ratios}]});
 }
}
for(const value of [null,0,30,30.01,69.99,70,100])for(const price of [null,0,19,20,21])cases.push({operation:'research_synthesis',args:[price,[{type:'RSI',latest:value,timestamps:[]},{type:'SMA',latest:20,timestamps:['2026-10-12']},{type:'MACD',latest:{histogram:value===null?null:value-50},timestamps:['2026-10-10']}],['Source-backed risk'],['Financials']]});
cases.push({operation:'research_synthesis',args:[20,[],[],[]]});
const nativeReport="Example Issuer PLC\nApproved on 1 March 2026\nCONSOLIDATED STATEMENT OF COMPREHENSIVE INCOME\nFor the year ended 31 December 2025\nKShs '000\n2025    2024\nRevenue    120,000    100,000\nProfit before tax    30,000    25,000\nIncome tax expense    (9,000)    (7,500)\nProfit after tax    21,000    17,500\nEarnings per share (KShs)    2.10    1.75\n\fCONSOLIDATED STATEMENT OF FINANCIAL POSITION\nAs at 31 December 2025\nKShs '000\n2025    2024\nTotal assets    300,000    250,000\nTotal liabilities    100,000    90,000\nTotal equity    200,000    160,000";
cases.push({operation:'native_annual_report',args:[nativeReport,'Example Issuer PLC','NSE:EXAMPLE']});
const confirmation={securityId:'NSE:KCB',statementType:'income',unitsVerified:true,periods:[{columnIndex:0,period:{periodType:'annual',fiscalYear:2025,periodEnd:'2025-12-31',reportedAt:'2026-03-01',currency:'KES'},income:{revenue:100,netIncome:20},sourcePage:1,note:'Verified source and units.'}]};
for(const change of ['valid','float-integer','unknown','null-field','quarter','duplicate','unverified','future','cashflow-empty','balance-invalid','unicode-note','bad-date']){
 const input=structuredClone(confirmation);
 if(change==='float-integer'){input.periods[0].columnIndex=0.0;input.periods[0].period.fiscalYear=2025.0;}
 if(change==='unknown'){input.unknown='strip';input.periods[0].income.unknown=5;}
 if(change==='null-field')input.periods[0].income.eps=null;
 if(change==='quarter')input.periods[0].period.fiscalQuarter=1;
 if(change==='duplicate')input.periods.push(structuredClone(input.periods[0]));
 if(change==='unverified')input.unitsVerified=false;
 if(change==='future')input.periods[0].period.reportedAt='2099-01-01';
 if(change==='cashflow-empty'){input.statementType='cashflow';input.periods[0].cashflow={};}
 if(change==='balance-invalid'){input.statementType='balance';input.periods[0].balance={totalAssets:100,totalLiabilities:20,totalEquity:20};}
 if(change==='unicode-note')input.periods[0].note='💜'.repeat(1001);
 if(change==='bad-date')input.periods[0].period.periodEnd='2025-02-30';
 cases.push({operation:'validate_historical_confirmation',args:[input]});
}
for(const rows of [[],[{fiscalYear:2024,revenue:100,netIncome:10,sharesOutstanding:100,totalAssets:100,totalLiabilities:30,totalEquity:20,reportedAt:'2027-01-01',periodEnd:'2024-12-31',sourceUrls:['https://fixture.example/a']}],[{fiscalYear:2021,revenue:100},{fiscalYear:2025,revenue:200}],[{fiscalYear:2024,revenue:100,netIncome:10,sharesOutstanding:100},{fiscalYear:2025,revenue:120,netIncome:20,sharesOutstanding:105,operatingCashFlow:5,freeCashFlow:-2,totalEquity:-1}],[{fiscalYear:2025,revenue:0},{fiscalYear:2025,revenue:20}]]){
 for(const sector of ['Banking','Industrial'])cases.push({operation:'analyze_financials',args:[rows,sector]});
 for(const quote of [null,{timestamp:'2026-01-01T12:00:00.000Z',source:'fixture'}])cases.push({operation:'data_quality',args:[quote,rows,'2026-10-13T12:00:00.000Z']});
 cases.push({operation:'scenarios',args:[rows.at(-1)??null]});
}
for(const length of [0,19,20,21,59,60,100]){
 const returns={A:Array.from({length},(_,i)=>Math.sin(i)*.02),B:Array.from({length},(_,i)=>Math.cos(i)*.01)};
 for(const weights of [{A:.7,B:.3},{A:1,B:0},{A:0,B:0}]){
  cases.push({operation:'risk_contributions',args:[returns,weights]});
  const series=Object.fromEntries(Object.entries(returns).map(([s,values])=>[s,[{timestamp:'2026-01-01T12:00:00.000Z',close:100},...values.map((v,i)=>({timestamp:new Date(Date.UTC(2026,0,i+2,12)).toISOString(),close:100+v*100}))]]));
  cases.push({operation:'portfolio_risk',args:[series,weights]});
 }
}
cases.push({operation:'risk_contributions',args:[{A:Array(60).fill(0)},{A:1}]});
for(const gap of [false,true]){
 const series=Object.fromEntries(['A','B'].map((s,j)=>[s,Array.from({length:70},(_,i)=>({timestamp:new Date(Date.UTC(2026,0,i+1+(gap&&i>=35?10:0),12)).toISOString(),close:100+(i%9)*(j+1)}))]));
 cases.push({operation:'portfolio_risk',args:[series,{A:.4,B:.6}]});
}
for(const actions of [[],[{date:'2026-01-02',dividend:2,sourceUrl:'https://fixture.example/a'}],[{date:'2026-01-02',splitRatio:2,sourceUrl:'https://fixture.example/a'}]])cases.push({operation:'total_return_series',args:[[{date:'2026-01-01',close:100},{date:'2026-01-02',close:52},{date:'2026-01-03',close:54}],actions]});
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
 const expected=JSON.parse(JSON.stringify((await operations[c.operation](...c.args))??null));
 const execution=spawnSync(python,[worker],{input:JSON.stringify(c),encoding:'utf8',timeout:5000,maxBuffer:4194304,
  env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PYTHONUTF8:'1'}});
 if(execution.status!==0)throw new Error(`Python calculation failed: ${c.operation}`);
 compare(expected,JSON.parse(execution.stdout),c.operation);
}
console.log(JSON.stringify({nativePythonParityCases:cases.length,operations:Object.keys(operations),passed:true,productionCutover:false}));
