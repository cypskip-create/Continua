export const monitoringKinds = ["material_change","price_below","price_above","debt_above","revenue_growth_below","earnings_growth_below","cash_conversion_below","dividend_payout_above","quote_age_above"] as const;
export interface MonitorRule {kind:string;threshold:number|null;last_state:{triggered?:boolean;fingerprint?:string}|null}
export function evaluateMonitor(rule:MonitorRule,state:{price:number|null;debt:number|null;growth:number|null;earningsGrowth?:number|null;cashConversion?:number|null;dividendPayout?:number|null;quoteAge?:number|null;fingerprint:string;material:boolean;quoteFresh:boolean}) {
  if(rule.kind==="material_change")return {triggered:false,fingerprint:state.fingerprint,notify:!!rule.last_state&&rule.last_state.fingerprint!==state.fingerprint&&state.material};
  const values:Record<string,number|null|undefined>={price_below:state.quoteFresh?state.price:null,price_above:state.quoteFresh?state.price:null,debt_above:state.debt,revenue_growth_below:state.growth,earnings_growth_below:state.earningsGrowth,cash_conversion_below:state.cashConversion,dividend_payout_above:state.dividendPayout,quote_age_above:state.quoteAge};
  const value=values[rule.kind];
  if(value==null||!Number.isFinite(value)||rule.threshold==null)return {triggered:rule.last_state?.triggered??false,fingerprint:state.fingerprint,notify:false,unavailable:true,value:null};
  const triggered=rule.kind.endsWith("above")?value>rule.threshold:value<rule.threshold;
  return {triggered,fingerprint:state.fingerprint,notify:triggered&&rule.last_state?.triggered!==true,unavailable:false,value};
}
