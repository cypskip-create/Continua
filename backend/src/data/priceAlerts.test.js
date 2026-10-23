import {describe,it,expect,vi} from 'vitest';
import {checkOwnedPriceAlerts} from './priceAlerts.js';
const identity={user:{id:'owner-fixture'},claims:{sub:'owner-fixture',role:'authenticated',session_id:'live-fixture'}};
function fixture({price='100.000000000000000001',count='1',guardError=false,deliveryError=false}={}){
 const calls=[],release=vi.fn();
 const database={connect:async()=>({release,query:async(sql,parameters)=>{
  calls.push({sql,parameters});
  if(sql.includes('continua_session_guard')&&guardError)throw Error('Revoked session');
  if(sql.includes('last_price::text'))return {rows:price===null?[]:[{price}]};
  if(sql.startsWith('SELECT count(*)'))return {rows:[{count}]};
  if(sql.startsWith('WITH candidates')){if(deliveryError)throw Error('Delivery failed');return {rows:[{triggered:'1',alerts:'[{"id":"alert","target_value":100.000000000000000001}]'}]};}
  return {rows:[]};
 }})};return {database,calls,release};
}
describe('owned price-alert authorization and exact data flow',()=>{
 it('ignores browser price and owner overrides and retains numeric JSON text',async()=>{
  const f=fixture();const json=await checkOwnedPriceAlerts({...f,identity,body:{symbol:'scom',exchange:'nse',currentPrice:1e99,user_id:'victim',accountId:'victim'}});
  const query=f.calls.find(call=>call.sql.startsWith('WITH candidates'));
  expect(query.parameters).toEqual(['owner-fixture','SCOM','NSE','100.000000000000000001']);
  expect(json).toContain('"target_value":100.000000000000000001');
  expect(f.calls.at(-1).sql).toBe('COMMIT');expect(f.release).toHaveBeenCalledOnce();
 });
 it('rechecks the live SQL session before reading or delivering alerts',async()=>{
  const f=fixture({guardError:true});await expect(checkOwnedPriceAlerts({...f,identity,body:{symbol:'SCOM'}})).rejects.toThrow('Revoked');
  expect(f.calls.some(call=>call.sql.includes('market.live_quotes'))).toBe(false);expect(f.calls.at(-1).sql).toBe('ROLLBACK');expect(f.release).toHaveBeenCalledOnce();
 });
 it('fails closed for missing quotes and oversized alert sets',async()=>{
  for(const configuration of [{price:null},{count:'1001'}]){const f=fixture(configuration);await expect(checkOwnedPriceAlerts({...f,identity,body:{symbol:'SCOM'}})).rejects.toThrow();expect(f.calls.some(call=>call.sql.startsWith('WITH candidates'))).toBe(false);expect(f.calls.at(-1).sql).toBe('ROLLBACK');}
 });
 it('rolls back every alert notification on delivery failure',async()=>{
  const f=fixture({deliveryError:true});await expect(checkOwnedPriceAlerts({...f,identity,body:{symbol:'SCOM'}})).rejects.toThrow('Delivery failed');expect(f.calls.at(-1).sql).toBe('ROLLBACK');expect(f.calls.some(call=>call.sql==='COMMIT')).toBe(false);
 });
});
