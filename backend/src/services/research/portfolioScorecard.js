import {query} from '../../storage/db.js';

export function aggregatePortfolioScorecard(rows){
 const total=rows.reduce((sum,row)=>sum+(Number.isFinite(row.value)&&row.value>0?row.value:0),0);
 const allPriced=rows.length>0&&rows.every(row=>Number.isFinite(row.value)&&row.value>0);
 const measures={};
 for(const key of ['valueScore','growth','health','income','risk','quality','momentum']){
  const eligible=rows.filter(row=>Number.isFinite(row[key])&&row[key]>=0&&row[key]<=100&&row.value>0);
  const coveredValue=eligible.reduce((sum,row)=>sum+row.value,0),coverage=total>0?coveredValue/total:0;
  measures[key]={score:allPriced&&coverage>=.6?eligible.reduce((sum,row)=>sum+row[key]*row.value,0)/coveredValue:null,coverage};
 }
 return {measures,holdingCount:rows.length,pricedCount:rows.filter(row=>row.value>0).length,methodology:'Holdings weighted by their current quoted value. Financial strength and risk use the same sector-aware company scores as stock research. A measure is unavailable when less than 60% of portfolio value has eligible information or any holding is unpriced.'};
}
export async function getPortfolioScorecard(userId,exchange){
 const result=await query(`WITH holdings AS (SELECT upper(symbol) symbol,sum(shares) shares FROM public.portfolios WHERE user_id=$1 GROUP BY upper(symbol) HAVING sum(shares)>0)
 SELECT h.symbol,(h.shares*q.last_price)::float8 value,
 c.afri_value::float8 "valueScore",c.afri_growth::float8 growth,c.afri_health::float8 health,c.afri_income::float8 income,c.afri_risk::float8 risk,c.afri_quality::float8 quality,c.afri_momentum::float8 momentum
 FROM holdings h LEFT JOIN market.securities s ON s.symbol=h.symbol AND s.exchange=$2
 LEFT JOIN market.live_quotes q ON q.security_id=s.id AND q.last_price>0 AND q.source<>'mock'
 LEFT JOIN market.afri_scores c ON c.security_id=s.id AND c.as_of=q.event_timestamp AND c.inputs->>'methodologyVersion'='continua-c-score-v2'`,[userId,exchange]);
 return aggregatePortfolioScorecard(result.rows);
}
