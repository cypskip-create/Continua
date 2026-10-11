/** Independently implemented research calculations, not investment advice or
 * proprietary institutional models. All shocks are explicit assumptions. */
export interface StressPosition {symbol:string;sector:string;value:number;asOf?:string|null}
export function stressPortfolio(positions:StressPosition[],marketShock:number,sectorShocks:Record<string,number>={}) {
  const total=positions.reduce((sum,p)=>sum+p.value,0);
  const contributions=positions.map(p=>{
    const sectorShock=sectorShocks[p.sector]??0;
    const shock=(1+marketShock)*(1+sectorShock)-1;
    return {...p,shock,pnl:p.value*shock,stressedValue:p.value*(1+shock)};
  });
  const pnl=contributions.reduce((sum,p)=>sum+p.pnl,0);
  return {totalValue:total,pnl,stressedValue:total+pnl,returnPercent:total>0?pnl/total*100:null,contributions,
    assumptions:{marketShock,sectorShocks},methodology:'One-step market and sector price shocks compound multiplicatively. Current positions only; no inferred beta, trading, tax, liquidity costs or probabilities.'};
}
const mean=(v:number[])=>v.reduce((s,n)=>s+n,0)/v.length;
const cov=(a:number[],b:number[])=>{const x=mean(a),y=mean(b);return a.reduce((s,n,i)=>s+(n-x)*(b[i]!-y),0)/(a.length-1);};
export function riskContributions(returns:Record<string,number[]>,weights:Record<string,number>) {
  const symbols=Object.keys(returns).filter(s=>Number.isFinite(weights[s])&&(weights[s]??0)>0),n=symbols.length?returns[symbols[0]!]!.length:0;
  if(n<20||symbols.some(s=>returns[s]!.length!==n||returns[s]!.some(v=>!Number.isFinite(v))))return null;
  const coverage=symbols.reduce((s,k)=>s+weights[k]!,0);
  const w=symbols.map(s=>weights[s]!/coverage);
  const matrix=symbols.map(a=>symbols.map(b=>cov(returns[a]!,returns[b]!)));
  const marginal=matrix.map(row=>row.reduce((s,c,j)=>s+c*w[j]!,0));
  const variance=w.reduce((s,v,i)=>s+v*marginal[i]!,0);
  if(!Number.isFinite(variance)||variance<=1e-18)return null;
  const weighted=Array.from({length:n},(_,i)=>symbols.reduce((s,k,j)=>s+w[j]!*returns[k]![i]!,0));
  const sorted=[...weighted].sort((a,b)=>a-b),tailCount=Math.ceil(n*0.05);
  const tail=sorted.slice(0,tailCount);
  return {coveredWeight:coverage,observations:n,
    contributions:symbols.map((symbol,i)=>({symbol,weight:w[i]!,varianceContribution:w[i]!*marginal[i]!,riskShare:w[i]!*marginal[i]!/variance})),
    historicalVaR95:n>=60?Math.max(0,-sorted[Math.max(0,Math.ceil(n*0.05)-1)]!)*100:null,
    expectedShortfall95:n>=60?Math.max(0,-mean(tail))*100:null,tailObservations:n>=60?tailCount:0,
    methodology:'Sample covariance attribution on identical observed daily returns; contributions sum to portfolio variance. Negative contributions can hedge other holdings. Historical one-day 95% VaR/expected shortfall require 60 observations and are not a maximum loss or a forecast.'};
}

export interface DatedCashFlow {date:string;amount:number}
export interface BondLabInput {settlement:string;previousCoupon:string;nextCoupon:string;couponPerPeriod:number;yieldPercent:number;frequency:number;cashFlows:DatedCashFlow[];shockBps:number}
export function bondRisk(input:BondLabInput) {
  const t=(date:string)=>(Date.parse(date)-Date.parse(input.settlement))/86400000/365;
  const y=input.yieldPercent/100,m=input.frequency;
  const price=(rate:number)=>input.cashFlows.reduce((s,f)=>s+f.amount/Math.pow(1+rate/m,m*t(f.date)),0);
  const dirty=price(y),step=0.0001,up=price(y+step),down=price(y-step);
  const elapsed=Date.parse(input.settlement)-Date.parse(input.previousCoupon),period=Date.parse(input.nextCoupon)-Date.parse(input.previousCoupon);
  const accrued=input.couponPerPeriod*elapsed/period;
  const duration=(down-up)/(2*dirty*step),convexity=(down+up-2*dirty)/(dirty*step*step);
  const shock=input.shockBps/10000,stressed=price(y+shock);
  return {dirtyPrice:dirty,accruedInterest:accrued,cleanPrice:dirty-accrued,modifiedDuration:duration,convexity,
    dv01:dirty*duration/10000,stressedDirtyPrice:stressed,pnl:stressed-dirty,approximatePnl:dirty*(-duration*shock+0.5*convexity*shock*shock),
    cashFlows:input.cashFlows.map(f=>({...f,presentValue:f.amount/Math.pow(1+y/m,m*t(f.date))})),
    basis:'User-supplied cash flows per chosen face amount. ACT/365 discount times with nominal yield compounded at the selected frequency; actual/actual coupon-period accrual. Not CBK settlement pricing, tax, transaction fees or an interpolated market curve.'};
}
export interface FuturesLabInput {entry:number;settlement:number;multiplier:number;contracts:number;side:'long'|'short';margin:number;expiry:string;asOf:string;shockPercent:number}
export function futuresRisk(input:FuturesLabInput) {
  const direction=input.side==='long'?1:-1,quantity=input.multiplier*input.contracts;
  const pnl=(input.settlement-input.entry)*quantity*direction;
  const stressPnl=input.settlement*(input.shockPercent/100)*quantity*direction;
  return {notional:input.settlement*quantity,pnl,stressPnl,marginBalance:input.margin+pnl,stressedMarginBalance:input.margin+pnl+stressPnl,
    effectiveLeverage:input.margin>0?input.settlement*quantity/input.margin:null,expired:input.expiry<input.asOf,
    basis:'User-entered contract multiplier, settlement, expiry and margin. Linear futures only. Margin is collateral, not the maximum loss. No options pricing, exchange margin simulation, trade execution or verified contract feed.'};
}

export interface ReturnPoint {date:string;close:number}
export interface VerifiedAction {date:string;splitRatio?:number;dividend?:number;sourceUrl:string}
export function totalReturnSeries(points:ReturnPoint[],actions:VerifiedAction[]) {
  const bars=[...points].sort((a,b)=>a.date.localeCompare(b.date));
  if(new Set(bars.map(p=>p.date)).size!==bars.length||bars.some(p=>!Number.isFinite(p.close)||p.close<=0))throw new Error('Unique positive dated closes required');
  const validDate=(date:string)=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
  if(bars.some(p=>!validDate(p.date)))throw new Error('Real calendar dates required');
  if(actions.some(a=>!validDate(a.date)||!/^https:\/\//i.test(a.sourceUrl)||(a.splitRatio!=null&&(!Number.isFinite(a.splitRatio)||a.splitRatio<=0))||(a.dividend!=null&&(!Number.isFinite(a.dividend)||a.dividend<0))||(a.splitRatio==null&&a.dividend==null)))throw new Error('Valid source-backed corporate actions required');
  if(actions.some(a=>a.splitRatio!=null&&actions.some(b=>b.date===a.date&&b.dividend!=null)))throw new Error('Same-date split and dividend require a verified per-share basis mapping');
  const eventKeys=actions.map(a=>`${a.date}:${a.splitRatio!=null?'split':'dividend'}`);
  if(new Set(eventKeys).size!==eventKeys.length)throw new Error('Duplicate corporate-action dates require reconciliation');
  let wealth=100;
  return bars.map((bar,index)=>{
    if(index>0){const prev=bars[index-1]!;
      const events=actions.filter(a=>a.date>prev.date&&a.date<=bar.date);
      if(events.some(a=>a.date!==bar.date))throw new Error('An action date lacks an observed close; adjustment cannot be inferred across a gap');
      const ratio=events.reduce((s,a)=>s*(a.splitRatio??1),1),dividend=events.reduce((s,a)=>s+(a.dividend??0),0);
      wealth*=(bar.close*ratio+dividend)/prev.close;
    }
    return {date:bar.date,index:wealth};
  });
}
