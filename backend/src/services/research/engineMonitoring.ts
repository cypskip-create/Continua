export interface MonitorRule {kind:string;threshold:number|null;last_state:{triggered?:boolean;fingerprint?:string}|null}
export function evaluateMonitor(rule:MonitorRule,state:{price:number|null;debt:number|null;growth:number|null;fingerprint:string;material:boolean;quoteFresh:boolean}) {
  if(rule.kind==="material_change")return {triggered:false,fingerprint:state.fingerprint,notify:!!rule.last_state&&rule.last_state.fingerprint!==state.fingerprint&&state.material};
  const value=rule.kind.startsWith("price_")?state.quoteFresh?state.price:null:rule.kind==="debt_above"?state.debt:state.growth;
  if(value==null||!Number.isFinite(value)||rule.threshold==null)return {triggered:rule.last_state?.triggered??false,fingerprint:state.fingerprint,notify:false,unavailable:true};
  const triggered=rule.kind.endsWith("above")?value>rule.threshold:value<rule.threshold;
  return {triggered,fingerprint:state.fingerprint,notify:triggered&&rule.last_state?.triggered!==true,unavailable:false};
}
