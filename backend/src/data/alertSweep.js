// No provider HTTP calls or browser claims. The existing SQL delivery function
// atomically marks an unchanged alert and creates its notification exactly once.
export function indicatorDecision(alert,series){
 const params=alert.indicator_params??{};
 if(alert.indicator==='RSI'){
  const latest=series[0]?.at(-1),threshold=params.threshold??30;
  if(!Number.isFinite(latest)||!Number.isFinite(threshold))return null;
  const above=alert.alert_type==='rsi_above';
  if(!['rsi_above','rsi_below'].includes(alert.alert_type))return null;
  return (above?latest>=threshold:latest<=threshold)?`RSI(${params.period??14}) is ${latest.toFixed(1)}, crossed ${above?'above':'below'} ${threshold}`:null;
 }
 const [fast,slow]=series;if(!fast||!slow||fast.length!==slow.length||fast.length<2)return null;
 const values=[fast.at(-2),fast.at(-1),slow.at(-2),slow.at(-1)];
 if(!values.every(Number.isFinite))return null;
 const [f0,f1,s0,s1]=values;
 const direction=f0<=s0&&f1>s1?'bullish':f0>=s0&&f1<s1?'bearish':null;
 return direction===(params.direction===-1?'bearish':'bullish')?`${alert.indicator==='SMA_CROSS'?'SMA':'EMA'}(${params.fastPeriod??10}) crossed ${direction} through ${alert.indicator==='SMA_CROSS'?'SMA':'EMA'}(${params.slowPeriod??30})`:null;
}

export async function runOwnedAlertSweep({database,computeIndicator,now=()=>Date.now(),ownerId=null}){
 const client=await database.connect(),started=now(),cache=new Map();
 const receipt={priceChecked:0,indicatorChecked:0,triggered:0,unavailable:0};
 try{
  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout='10000ms'");
  await client.query("SET LOCAL idle_in_transaction_session_timeout='30000ms'");
  const locked=(await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended('continua-owned-alert-sweep',0)) locked")).rows[0]?.locked;
  if(!locked){await client.query('ROLLBACK');return {...receipt,skipped:true};}
  const alerts=(await client.query(`SELECT id::text,user_id::text,symbol,exchange,currency,alert_type,target_value::text,indicator,indicator_params,updated_at::text FROM public.price_alerts WHERE is_active AND triggered_at IS NULL AND ($1::uuid IS NULL OR user_id=$1) ORDER BY id LIMIT 1001`,[ownerId])).rows;
  if(alerts.length>1000)throw Error('Alert sweep exceeds its reviewed 1000-alert resource budget');
  async function indicator(alert,type,period){
   if(!Number.isInteger(period)||period<1||period>500)return null;
   const key=JSON.stringify([alert.exchange,alert.symbol,type,period]);
   if(!cache.has(key)){
    if(cache.size>=100)throw Error('Indicator sweep exceeds its reviewed computation budget');
    const to=new Date(started).toISOString(),from=new Date(started-(Math.max(period,50)+30)*86400000).toISOString();
    const result=await computeIndicator({exchange:alert.exchange??'NSE',symbol:alert.symbol.toUpperCase(),type,period,from,to});
    cache.set(key,Array.isArray(result?.values)?result.values:null);
   }
   return cache.get(key);
  }
  for(const alert of alerts){
   if(now()-started>45000)throw Error('Alert sweep deadline exceeded');
   if(!/^[A-Z0-9]{1,20}$/.test(alert.symbol)||!/^[A-Z0-9.-]{1,20}$/.test(alert.exchange??'NSE')){receipt.unavailable++;continue;}
   let detail,title;
   if(!alert.indicator){
    receipt.priceChecked++;
    const rows=(await client.query(`SELECT last_price::text price,CASE WHEN $3='price_above' THEN last_price >= $4::numeric WHEN $3='price_below' THEN last_price <= $4::numeric ELSE false END triggered FROM market.live_quotes WHERE symbol=$1 AND exchange=$2 AND last_price>0 LIMIT 2`,[alert.symbol,alert.exchange??'NSE',alert.alert_type,alert.target_value])).rows;
    if(rows.length!==1){receipt.unavailable++;continue;}
    if(!rows[0].triggered)continue;
    const currency=alert.currency??'KES';
    title=`${alert.symbol} alert triggered`;
    detail=`${alert.symbol} has ${alert.alert_type==='price_above'?'risen above':'fallen below'} ${currency} ${alert.target_value} (now ${currency} ${rows[0].price})`;
   }else{
    receipt.indicatorChecked++;
    const params=alert.indicator_params??{};let values;
    if(alert.indicator==='RSI')values=[await indicator(alert,'RSI',params.period??14)];
    else if(['SMA_CROSS','EMA_CROSS'].includes(alert.indicator)){
     const type=alert.indicator==='SMA_CROSS'?'SMA':'EMA';
     values=[await indicator(alert,type,params.fastPeriod??10),await indicator(alert,type,params.slowPeriod??30)];
    }else{receipt.unavailable++;continue;}
    if(values.some(value=>!value)){receipt.unavailable++;continue;}
    detail=indicatorDecision(alert,values);if(!detail)continue;
    title=`${alert.symbol} indicator alert triggered`;
   }
   const delivered=(await client.query('SELECT public.deliver_alert_notification($1,$2,$3,$4::timestamptz) delivered',[alert.id,title,detail,alert.updated_at])).rows[0]?.delivered;
   if(delivered)receipt.triggered++;
  }
  await client.query('COMMIT');return receipt;
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
 finally{client.release();}
}

export async function expireOwnedMemberships(database){
 // Existing SQL handles entitlement transitions; no payment provider is called.
 return database.query('SELECT public.expire_paid_memberships()');
}
