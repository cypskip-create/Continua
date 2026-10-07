import { query } from "../../storage/db.js";
import { pricesRepository } from "../../storage/repositories/pricesRepository.js";
import { candlesRepository } from "../../storage/repositories/candlesRepository.js";
import { securitiesRepository } from "../../storage/repositories/securitiesRepository.js";
import { financialsRepository } from "../../storage/repositories/financialsRepository.js";
import { corporateActionsRepository } from "../../storage/repositories/corporateActionsRepository.js";
import { researchService } from "./researchService.js";
import { trailingDividendPerShare } from "./dividendMetrics.js";
import { analyzeFinancials } from "./engineAnalytics.js";
import { portfolioAnalysis, alignedReturns, performance, type PricedPosition } from "./enginePortfolio.js";
import type { ExchangeCode } from "../../config/index.js";
export async function getPortfolioResearch(userId:string,exchange:ExchangeCode) {
  const holdings=(await query<{symbol:string;shares:number;sector:string|null}>("SELECT symbol,sum(shares)::float8 AS shares,max(sector) AS sector FROM public.portfolios WHERE user_id=$1 GROUP BY symbol ORDER BY symbol LIMIT 50",[userId])).rows;
  const instruments=await securitiesRepository.listInstruments(exchange),known=new Map(instruments.map(i=>[i.symbol,i]));
  const positions:PricedPosition[]=await Promise.all(holdings.map(async h=>{
    const instrument=known.get(h.symbol.toUpperCase());
    const quote=instrument?await pricesRepository.getQuote(instrument.securityId):null;
    return {symbol:h.symbol.toUpperCase(),shares:h.shares,sector:h.sector??instrument?.sector??"Unclassified",price:quote?.lastPrice??null,change:quote?.change??null,volume:quote?.volume??null,currency:quote?.currency??"unknown",asOf:quote?.timestamp??null};
  }));
  const analysis=portfolioAnalysis(positions);
  const currency=positions.find(p=>p.price!=null)?.currency??null;
  // Never write a partial or mixed-session valuation as a performance snapshot.
  const dates=positions.map(p=>p.asOf?.slice(0,10));
  const complete=positions.length>0&&analysis.available&&positions.every(p=>p.price!=null&&Number.isFinite(p.price)&&p.price>0&&p.asOf)&&new Set(dates).size===1;
  if(complete)await query("INSERT INTO market.engine_portfolio_snapshots(user_id,exchange,currency,session_date,total_value,holdings) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(user_id,exchange,session_date) DO UPDATE SET total_value=EXCLUDED.total_value,holdings=EXCLUDED.holdings,captured_at=now()",[userId,exchange,currency,dates[0],analysis.totalValue,JSON.stringify(positions)]);
  const snapshots=(await query<{date:string;value:number;flow:number}>(`SELECT s.session_date::text AS date,s.total_value::float8 AS value,
    COALESCE((SELECT sum(amount) FROM public.engine_cash_flows f WHERE f.user_id=s.user_id AND f.exchange=s.exchange AND f.session_date>s.session_date-interval '1 day' AND f.session_date<=s.session_date),0)::float8 AS flow
    FROM market.engine_portfolio_snapshots s WHERE user_id=$1 AND exchange=$2 ORDER BY session_date`,[userId,exchange])).rows;
  const flows=(await query("SELECT id,session_date::text AS date,amount::float8 AS amount,note FROM public.engine_cash_flows WHERE user_id=$1 AND exchange=$2 ORDER BY session_date DESC LIMIT 100",[userId,exchange])).rows;
  // Aggregate flows across gaps between actual valuation snapshots.
  const periodFlows=(await query<{date:string;amount:number}>("SELECT session_date::text AS date,sum(amount)::float8 AS amount FROM public.engine_cash_flows WHERE user_id=$1 AND exchange=$2 GROUP BY session_date",[userId,exchange])).rows;
  snapshots.forEach((s,index)=>{if(index>0)s.flow=periodFlows.filter(f=>f.date>snapshots[index-1]!.date&&f.date<=s.date).reduce((sum,f)=>sum+f.amount,0);});
  const histories=await Promise.all(positions.filter(p=>p.price!=null).slice(0,10).map(async p=>{
    const instrument=known.get(p.symbol)!;
    try{
      const from=new Date(Date.now()-365*86400000).toISOString();
      const [bars,actions]=await Promise.all([candlesRepository.getCandles(instrument.securityId,"1d",from,new Date().toISOString()),corporateActionsRepository.getBySecurity(instrument.securityId)]);
      const split=actions.some(a=>(a.type==="split"||a.type==="bonus_issue")&&a.status!=="cancelled"&&(a.effectiveDate??a.exDate??"")>=from.slice(0,10));
      return {symbol:p.symbol,bars:split?[]:bars,blocked:split};
    }catch{return {symbol:p.symbol,bars:[],blocked:false};}
  }));
  const correlations=alignedReturns(Object.fromEntries(histories.filter(h=>h.bars.length>=21).map(h=>[h.symbol,h.bars])));
  const dividends=await Promise.all(positions.filter(p=>p.price!=null).slice(0,20).map(async p=>{
    try {const actions=await corporateActionsRepository.getDividendsBySecurity(known.get(p.symbol)!.securityId);const dps=trailingDividendPerShare(actions);return {symbol:p.symbol,trailingIncome:dps==null?null:dps*p.shares,upcoming:actions.filter(a=>a.status!=="cancelled"&&a.details.type==="dividend"&&a.payDate&&a.payDate>new Date().toISOString().slice(0,10)).map(a=>({date:a.payDate!,amount:a.details.type==="dividend"?a.details.amountPerShare*p.shares:0}))};}catch{return {symbol:p.symbol,trailingIncome:null,upcoming:[]};}
  }));
  return {...analysis,currency,correlations,dividends,performance:performance(snapshots,periodFlows),snapshots,flows,
    methodology:"Latest-session contribution uses current share counts and quote changes. Snapshot returns describe recorded invested holdings, not brokerage total return; external flows must be entered, and cash balances are excluded.",
    historyWarnings:histories.filter(h=>h.blocked).map(h=>`${h.symbol}: correlation excluded because corporate-action adjustment basis is unverified.`)};
}
export async function getPeers(symbol:string,exchange:ExchangeCode) {
  const profile=await securitiesRepository.getCompanyProfile(exchange,symbol);
  if(!profile)return [];
  const candidates=(await securitiesRepository.listInstruments(exchange)).filter(i=>i.sector===profile.company.sectorName&&i.currency===profile.currency&&i.symbol!==symbol).slice(0,5);
  return Promise.all(candidates.map(async peer=>{
    const [ratios,history]=await Promise.all([researchService.getRatios(peer.securityId),financialsRepository.getHistoricalPeriods(peer.securityId,"annual",2)]);
    const financial=analyzeFinancials(history,peer.sector??"");
    return {symbol:peer.symbol,name:peer.companyName,sector:peer.sector,currency:peer.currency,period:financial.period,ratios,metrics:financial.metrics};
  }));
}
