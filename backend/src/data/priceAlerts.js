// Owned replacement for check-price-alerts. Prices and comparisons remain SQL
// NUMERIC; the browser's currentPrice, accountId and user_id are never trusted.
export async function checkOwnedPriceAlerts({database,identity,body}){
 if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.symbol!=='string'||body.symbol.length>20)throw Object.assign(Error('Invalid symbol'),{status:400});
 const symbol=body.symbol.toUpperCase().replace(/[^A-Z0-9]/g,''),exchange=typeof body.exchange==='string'&&body.exchange.length?body.exchange.toUpperCase():'NSE';
 if(!symbol||!/^[A-Z0-9.-]{1,20}$/.test(exchange))throw Object.assign(Error('Invalid exchange or symbol'),{status:400});
 const client=await database.connect();
 try{
  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout='8000ms'");
  await client.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify(identity.claims)]);
  await client.query('SELECT public.continua_session_guard()');
  const quote=(await client.query(`SELECT last_price::text price FROM market.live_quotes WHERE symbol=$1 AND exchange=$2 AND last_price>0 LIMIT 2`,[symbol,exchange])).rows;
  if(quote.length!==1||!/^\d+(?:\.\d+)?$/.test(quote[0].price))throw Object.assign(Error('Verified quote unavailable'),{status:503});
  const parameters=[identity.user.id,symbol,exchange,quote[0].price];
  const scope=`user_id=$1 AND symbol=$2 AND exchange=$3 AND is_active AND triggered_at IS NULL AND indicator IS NULL`;
  const checked=Number((await client.query(`SELECT count(*)::text count FROM (SELECT id FROM public.price_alerts WHERE ${scope} LIMIT 1001) bounded`,parameters.slice(0,3))).rows[0].count);
  if(checked>1000)throw Object.assign(Error('Too many alerts for one check'),{status:413});
  const result=(await client.query(`WITH candidates AS MATERIALIZED (
   SELECT a.* FROM public.price_alerts a WHERE ${scope}
    AND ((alert_type='price_above' AND $4::numeric>=target_value) OR (alert_type='price_below' AND $4::numeric<=target_value))
  ), delivery AS MATERIALIZED (
   SELECT row_to_json(a) payload,public.deliver_alert_notification(a.id,a.symbol||' alert triggered',
    a.symbol||' has '||CASE WHEN a.alert_type='price_above' THEN 'risen above' ELSE 'fallen below' END||' '||coalesce(a.currency,'KES')||' '||a.target_value::text||' (now '||coalesce(a.currency,'KES')||' '||($4::numeric)::text||')',a.updated_at) delivered
   FROM candidates a
  ) SELECT count(*) FILTER(WHERE delivered)::text triggered,coalesce(json_agg(payload) FILTER(WHERE delivered),'[]'::json)::text alerts FROM delivery`,parameters)).rows[0];
  if(Buffer.byteLength(result.alerts)>4194304)throw Object.assign(Error('Alert response too large'),{status:413});
  await client.query('COMMIT');
  return `{"checked":${checked},"triggered":${Number(result.triggered)},"alerts":${result.alerts}}`;
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
 finally{client.release();}
}
