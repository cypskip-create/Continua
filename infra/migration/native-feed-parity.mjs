import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as mapper from '../../backend/src/adapters/nse/nseMapper.js';
import {normalizePrice} from '../../backend/src/normalization/prices/normalizePrice.js';
import {normalizeIndex} from '../../backend/src/normalization/indices/normalizeIndex.js';
import {normalizeIncomeStatement,normalizeCashFlow,checkBalanceSheetIntegrity} from '../../backend/src/normalization/financials/normalizeFinancials.js';
import {normalizeCompany,normalizeSecurity,canonicalizeSector} from '../../backend/src/normalization/companies/normalizeCompany.js';
let count=0;
function check(operation,args,expected){
 const p=spawnSync(process.env.NATIVE_PYTHON_BIN??'python3',[fileURLToPath(new URL('../../engine-python/worker.py',import.meta.url))],{input:JSON.stringify({operation,args}),encoding:'utf8',timeout:5000,maxBuffer:4194304,env:{PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PYTHONUTF8:'1'}});
 assert.equal(p.status,0,operation);assert.deepEqual(JSON.parse(p.stdout),JSON.parse(JSON.stringify(expected)));count++;
}
const security={Symbol:'KCB',ISIN:'KE0000000067',CompanyName:'KCB Group PLC',Sector:' Banking ',TradingStatus:'ACTIVE',ListingDate:'1990-01-01'};
for(const status of ['ACTIVE','SUSPENDED','HALTED','DELISTED','OTHER']){const raw={...security,TradingStatus:status};check('map_feed',['security',raw],mapper.mapSecurity(raw));}
check('map_feed',['sector',security],mapper.mapSector(security));
for(const profile of [null,{Description:'Literal profile',Headquarters:'Nairobi',ChiefExecutive:'Observed name',EmployeeCount:1000,FoundedYear:1970,Website:'https://fixture.example'}])check('map_feed',['company',security,profile],mapper.mapCompany(security,profile));
for(const stamp of ['2026-10-14T15:00:00','2026-10-14T15:00:00+03:00','2026-10-14T12:00:00Z']){
 const raw={Symbol:'KCB',LastTradedPrice:30,Open:29,High:31,Low:28,PrevClose:29,Change:99,ChangePct:99,Volume:100,MarketCapMn:123,EventTimestamp:stamp,Currency:'KES',TradingStatus:'ACTIVE'};
 const mapped=mapper.mapQuote(raw);check('map_feed',['quote',raw],mapped);check('normalize_feed',['price',mapped],normalizePrice(mapped));
 check('map_feed',['candle',{Symbol:'KCB',Interval:'1D',BarTime:stamp,O:29,H:31,L:28,C:30,V:100}],mapper.mapCandle({Symbol:'KCB',Interval:'1D',BarTime:stamp,O:29,H:31,L:28,C:30,V:100}));
}
const financial={Symbol:'KCB',FiscalYear:2025,PeriodType:'ANNUAL',Currency:'KES',PeriodEndDate:'2025-12-31',ReportedDate:'2026-03-01',Revenue:100,NetIncome:20,EPS:2,TotalAssets:500,TotalLiabilities:400,TotalEquity:100};
for(const raw of [financial,{...financial,FiscalQuarter:2,PeriodType:'QUARTERLY'}])check('map_feed',['financials',raw],mapper.mapFinancials(raw));
check('map_fundamentals',[security,null,financial],mapper.mapFundamentalsBundle(security,null,financial));
for(const [ActionType,Payload]of [['DIVIDEND',{AmountPerShare:'2.50'}],['SPLIT',{RatioFrom:1,RatioTo:2}],['BONUS',{RatioFrom:2,RatioTo:1}],['RIGHTS',{Ratio:'1:4',PriceKes:20}],['BUYBACK',{SharesTargeted:'1000'}],['MERGER',{Counterparty:'Fixture PLC',Notes:null}],['ACQUISITION',{}],['SUSPENSION',{Reason:'Observed notice'}],['HALT',{}]]){
 const raw={Symbol:'KCB',ActionType,Payload,Status:'CONFIRMED',AnnouncedDate:'2026-01-01'};check('map_feed',['action',raw,null,'action-id'],mapper.mapCorporateAction(raw,'action-id'));
}
const earnings={Symbol:'KCB',FiscalYear:2025,FiscalQuarter:2,EpsActual:null,ExpectedDate:'2026-03-01'};check('map_feed',['earnings',earnings,null,'earnings-id'],mapper.mapEarningsEvent(earnings,'earnings-id'));
const ownership={Symbol:'KCB',HolderName:'Fixture fund',HolderType:'INSTITUTION',SharesHeld:100,PercentHeld:1,AsOfDate:'2026-01-01'};check('map_feed',['ownership',ownership],mapper.mapOwnership(ownership));
for(const [kind,fn,row]of [['index',normalizeIndex,{code:' nasi ',value:100,previousClose:99,change:999}],['income',normalizeIncomeStatement,{periodId:'p',revenue:100,netIncome:-2,eps:-.2,costOfRevenue:80}],['cashflow',normalizeCashFlow,{periodId:'p',capex:2}],['cashflow',normalizeCashFlow,{periodId:'p',operatingCashFlow:10,capex:2}],['balance-integrity',checkBalanceSheetIntegrity,{totalAssets:100,totalLiabilities:80,totalEquity:20}],['company',normalizeCompany,{name:' Fixture ',description:' Literal ',headquarters:null}],['security',normalizeSecurity,{symbol:' kcb '}]])check('normalize_feed',[kind,row],fn(row));
check('normalize_feed',['sector',{name:' banking '}],canonicalizeSector(' banking '));
console.log(JSON.stringify({nativeFeedMapperComparisons:count,passed:true,fixtureOnly:true,productionCutover:false}));
