import cron from "node-cron";
import { env } from "../config/index.js";
import type { ExchangeCode } from "../config/index.js";
import { query,withTransaction } from "../storage/db.js";
import { logger } from "../monitoring/logger.js";
import { getEngineBundle } from "../services/research/engineBundle.js";
import { evaluateMonitor,type MonitorRule } from "../services/research/engineMonitoring.js";
export async function runEngineMonitoringOnce(userId:string|null=null,symbol:string|null=null,exchange:string|null=null) {
  const rules=(await query<MonitorRule&{id:string;user_id:string;symbol:string;exchange:ExchangeCode;notify_enabled:boolean}>(`SELECT r.*,COALESCE((pref.settings->>'notifications')::boolean,true) AS notify_enabled FROM market.engine_monitor_rules r
    JOIN public.profiles p ON p.user_id=r.user_id
    LEFT JOIN public.engine_preferences pref ON pref.user_id=r.user_id
    WHERE r.enabled AND public.effective_subscription_plan(p.user_id) = 'premium_plus'
    AND ($1::text IS NULL OR r.user_id::text=$1) AND ($2::text IS NULL OR r.symbol=$2) AND ($3::text IS NULL OR r.exchange=$3)
    ORDER BY r.created_at LIMIT 500`,[userId,symbol,exchange])).rows;
  for(const rule of rules){try{
    const data=await getEngineBundle(rule.symbol,rule.exchange);
    const quoteFresh=!!data.quote?.timestamp&&Date.now()-Date.parse(data.quote.timestamp)<7*86400000;
    await withTransaction(async client=>{
      const current=(await client.query<MonitorRule>("SELECT kind,threshold,last_state FROM market.engine_monitor_rules WHERE id=$1 AND enabled FOR UPDATE",[rule.id])).rows[0];if(!current)return;
      const state={...evaluateMonitor(current,{price:data.quote?.lastPrice??null,debt:data.financialAnalysis.metrics.debtToEquity,growth:data.financialAnalysis.metrics.revenueGrowth,earningsGrowth:data.financialAnalysis.metrics.earningsGrowth,cashConversion:data.financialAnalysis.metrics.cashConversion,dividendPayout:data.dividendAnalysis.payoutRatio,quoteAge:data.quote?.timestamp?Math.max(0,(Date.now()-Date.parse(data.quote.timestamp))/86400000):null,fingerprint:data.changes.fingerprint,material:data.changes.changes.some(c=>c.material),quoteFresh}),checkedAt:new Date().toISOString(),asOf:rule.kind.startsWith("price_")||rule.kind==="quote_age_above"?data.quote?.timestamp:data.quality.periodEnd};
      if(!data.changes.fingerprint&&rule.kind==="material_change"){state.unavailable=true;state.notify=false;state.fingerprint=current.last_state?.fingerprint??"";}
      if(state.notify&&rule.notify_enabled){
        const eventKey=rule.kind==="material_change"?state.fingerprint:new Date().toISOString().slice(0,10)+":"+rule.kind;
        const inserted=await client.query("INSERT INTO market.engine_monitor_deliveries(rule_id,event_key) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING rule_id",[rule.id,eventKey]);
        if(inserted.rows.length){const notice=(await client.query<{id:string}>("INSERT INTO public.notifications(user_id,type,feature,title,message,action_url,entity_type) VALUES($1,'engine','engine',$2,$3,$4,'engine') RETURNING id",[rule.user_id,rule.symbol+" research update",rule.kind==="material_change"?data.changes.changes.filter(c=>c.material).map(c=>c.text).join(" ").slice(0,500):`Your ${rule.kind.replaceAll("_"," ")} research threshold was crossed. Review the dated data in Engine.`,`/engine?symbol=${encodeURIComponent(rule.symbol)}`])).rows[0]!;await client.query("UPDATE market.engine_monitor_deliveries SET notification_id=$3 WHERE rule_id=$1 AND event_key=$2",[rule.id,eventKey,notice.id]);}
      }
      await client.query("UPDATE market.engine_monitor_rules SET last_state=$2::jsonb WHERE id=$1",[rule.id,JSON.stringify(state)]);
    });
  }catch(error){logger.warn({ruleId:rule.id,error:error instanceof Error?error.message:"monitoring failed"},"Engine rule evaluation failed");await query("UPDATE market.engine_monitor_rules SET last_state=COALESCE(last_state,'{}'::jsonb)||$2::jsonb WHERE id=$1",[rule.id,JSON.stringify({checkedAt:new Date().toISOString(),error:"Research inputs could not load. Previous state retained."})]).catch(()=>{});}}
}
export function startEngineMonitorWorker(){let running=false;const task=cron.schedule("*/10 * * * *",()=>{if(running||!env.ENGINE_MONITOR_ENABLED)return;running=true;void runEngineMonitoringOnce().catch(error=>logger.warn({error:error instanceof Error?error.message:"monitoring failed"},"Engine monitoring unavailable")).finally(()=>{running=false;});});return task;}
