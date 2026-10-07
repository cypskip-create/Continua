import cron from "node-cron";
import { env } from "../config/index.js";
import type { ExchangeCode } from "../config/index.js";
import { query,withTransaction } from "../storage/db.js";
import { logger } from "../monitoring/logger.js";
import { getEngineBundle } from "../services/research/engineBundle.js";
import { evaluateMonitor,type MonitorRule } from "../services/research/engineMonitoring.js";
export async function runEngineMonitoringOnce() {
  const rules=(await query<MonitorRule&{id:string;user_id:string;symbol:string;exchange:ExchangeCode}>(`SELECT r.* FROM market.engine_monitor_rules r
    JOIN public.profiles p ON p.user_id=r.user_id
    LEFT JOIN public.engine_preferences pref ON pref.user_id=r.user_id
    WHERE r.enabled AND p.subscription_plan IN ('premium','premium_plus') AND COALESCE((pref.settings->>'notifications')::boolean,true)
    ORDER BY r.created_at LIMIT 500`)).rows;
  for(const rule of rules){try{
    const data=await getEngineBundle(rule.symbol,rule.exchange);
    const quoteFresh=!!data.quote?.timestamp&&Date.now()-Date.parse(data.quote.timestamp)<7*86400000;
    await withTransaction(async client=>{
      const current=(await client.query<MonitorRule>("SELECT kind,threshold,last_state FROM market.engine_monitor_rules WHERE id=$1 AND enabled FOR UPDATE",[rule.id])).rows[0];if(!current)return;
      const state=evaluateMonitor(current,{price:data.quote?.lastPrice??null,debt:data.financialAnalysis.metrics.debtToEquity,growth:data.financialAnalysis.metrics.revenueGrowth,fingerprint:data.changes.fingerprint,material:data.changes.changes.some(c=>c.material),quoteFresh});
      if(state.unavailable||!data.changes.fingerprint&&rule.kind==="material_change")return;
      if(state.notify){
        const eventKey=rule.kind==="material_change"?state.fingerprint:new Date().toISOString().slice(0,10)+":"+rule.kind;
        const inserted=await client.query("INSERT INTO market.engine_monitor_deliveries(rule_id,event_key) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING rule_id",[rule.id,eventKey]);
        if(inserted.rows.length){const notice=(await client.query<{id:string}>("INSERT INTO public.notifications(user_id,type,feature,title,message,action_url,entity_type) VALUES($1,'engine','engine',$2,$3,$4,'engine') RETURNING id",[rule.user_id,rule.symbol+" research update",rule.kind==="material_change"?data.changes.changes.filter(c=>c.material).map(c=>c.text).join(" ").slice(0,500):`Your ${rule.kind.replaceAll("_"," ")} research threshold was crossed. Review the dated data in Engine.`,`/engine?symbol=${encodeURIComponent(rule.symbol)}`])).rows[0]!;await client.query("UPDATE market.engine_monitor_deliveries SET notification_id=$3 WHERE rule_id=$1 AND event_key=$2",[rule.id,eventKey,notice.id]);}
      }
      await client.query("UPDATE market.engine_monitor_rules SET last_state=$2::jsonb WHERE id=$1",[rule.id,JSON.stringify(state)]);
    });
  }catch(error){logger.warn({ruleId:rule.id,error:error instanceof Error?error.message:"monitoring failed"},"Engine rule evaluation failed");}}
}
export function startEngineMonitorWorker(){let running=false;const task=cron.schedule("*/30 * * * *",()=>{if(running||!env.ENGINE_MONITOR_ENABLED)return;running=true;void runEngineMonitoringOnce().catch(error=>logger.warn({error:error instanceof Error?error.message:"monitoring failed"},"Engine monitoring unavailable")).finally(()=>{running=false;});});return task;}
