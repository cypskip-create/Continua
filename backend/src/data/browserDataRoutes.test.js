import {afterEach,describe,expect,it,vi} from 'vitest';
import express from 'express';
import {createBrowserDataRouter} from './browserDataRoutes.js';
import {createBrowserDataClient} from '../../../app/src/integrations/continua/browserDataClient.js';
const servers=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise(resolve=>server.close(resolve))));});
async function fixture(verifyAccess=async()=>({claims:{sub:'verified-user',role:'authenticated'}})){
 const client={query:vi.fn(async sql=>({rows:[{payload:sql.includes('community_')?'':'{}'}]})),release:vi.fn()};
 const database={connect:vi.fn(async()=>client)};
 const app=express();app.use(express.json({limit:'64kb'}));app.use('/data',createBrowserDataRouter({database,verifyAccess}));
 const server=app.listen(0,'127.0.0.1');servers.push(server);await new Promise(resolve=>server.once('listening',resolve));
 return {url:'http://127.0.0.1:'+server.address().port+'/data',client,database};
}
const post=(url,body,token='signed-fixture')=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-User-Token':token}:{})},body:JSON.stringify(body)});
describe('owned browser data transport',()=>{
 it('the real browser transport accepts the real router minimal reaction response on its first write',async()=>{
  const f=await fixture();const identity={getSession:async()=>({data:{session:{access_token:'signed-fixture'}},error:null})};let writes=0;
  const browser=createBrowserDataClient({origin:new URL(f.url).origin,identity,fetcher:async(url,options)=>{writes++;return fetch(url.replace('/api/v1/data','/data'),options);}});
  const result=await browser.from('post_reactions').upsert({post_id:'post',user_id:'verified-user',reaction:'wow'},{onConflict:'post_id,user_id'});
  expect(result.error).toBeNull();expect(result.status).toBe(201);expect(writes).toBe(1);expect(f.client.query.mock.calls.filter(([sql])=>sql.includes('INSERT INTO'))).toHaveLength(1);
 });
 it('builds the complete feed with one identity check and the existing SQL guard',async()=>{
  const verify=vi.fn(async()=>({claims:{sub:'verified-user',role:'authenticated'}}));const f=await fixture(verify);
  const response=await fetch(f.url+'/community_feed?select=*',{headers:{'X-User-Token':'signed-fixture'}});expect(response.status).toBe(200);expect(verify).toHaveBeenCalledOnce();
  expect(f.client.query.mock.calls.filter(([sql])=>sql==='SELECT public.continua_session_guard()')).toHaveLength(1);
  expect(f.client.query.mock.calls.find(([sql])=>sql.includes('WITH visible AS MATERIALIZED'))[1]).toEqual(['verified-user']);
 });
 it('rejects feed owner injection, anonymous callers and mutations without relaxing identity checks',async()=>{
  const f=await fixture();expect((await fetch(f.url+'/community_feed')).status).toBe(401);
  expect((await fetch(f.url+'/community_feed?user_id=other',{headers:{'X-User-Token':'signed-fixture'}})).status).toBe(400);
  expect((await post(f.url+'/community_feed',{})).status).toBe(404);expect(f.database.connect).not.toHaveBeenCalled();
 });
 it('preserves community safety RPCs and returns JSON null for SQL void',async()=>{const f=await fixture();for(const [name,body] of [['community_set_safety',{p_target:'fixture-user',p_kind:'block',p_enabled:true}],['community_submit_report',{p_kind:'post',p_target:'fixture-post',p_reason:'Other',p_details:'detail'}]]){const response=await post(f.url+'/rpc/'+name,body);expect(response.status).toBe(200);expect(await response.json()).toBe(null);}expect(f.client.query.mock.calls.some(([sql])=>sql==='SET LOCAL ROLE authenticated')).toBe(true);expect(f.client.query.mock.calls.find(([sql])=>sql.includes('public."community_set_safety"'))[1]).toEqual(['fixture-user','block',true]);});
 it('rejects unregistered RPCs and unexpected arguments before acquiring SQL connections',async()=>{const f=await fixture();expect((await post(f.url+'/rpc/arbitrary_function',{})).status).toBe(404);expect((await post(f.url+'/rpc/community_set_safety',{p_target:'x',p_kind:'block',p_enabled:true,role:'service_role'})).status).toBe(400);expect(f.database.connect).not.toHaveBeenCalled();});
 it('rejects invalid credentials rather than falling back to anonymous access',async()=>{const f=await fixture(async()=>{throw Error('revoked');});const response=await fetch(f.url+'/profiles_public',{headers:{'X-User-Token':'revoked'}});expect(response.status).toBe(401);expect((await response.json()).code).toBe('AUTH_INVALID');expect(f.database.connect).not.toHaveBeenCalled();});
 it('preserves anonymous access to public company-processing receipts',async()=>{const f=await fixture();const response=await post(f.url+'/rpc/company_processing_status',{p_symbol:'TEST'},null);expect(response.status).toBe(200);expect(await response.json()).toEqual({});expect(f.client.query.mock.calls.some(([sql])=>sql==='SET LOCAL ROLE anon')).toBe(true);expect(f.client.query.mock.calls.some(([sql])=>sql==='SELECT public.continua_session_guard()')).toBe(false);});
 it('requires a session for RPC mutations',async()=>{const f=await fixture();expect((await post(f.url+'/rpc/community_set_safety',{p_target:'x',p_kind:'block',p_enabled:true},null)).status).toBe(401);expect(f.database.connect).not.toHaveBeenCalled();});
 it('rolls back SQL failures and releases the connection without exposing database messages',async()=>{const f=await fixture();f.client.query.mockImplementation(async sql=>{if(sql.includes('public."community_submit_report"'))throw Object.assign(Error('private database detail'),{code:'42501'});return {rows:[]};});const response=await post(f.url+'/rpc/community_submit_report',{p_kind:'post',p_target:'x',p_reason:'Other'});expect(response.status).toBe(403);expect(await response.text()).not.toContain('private database detail');expect(f.client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');expect(f.client.release).toHaveBeenCalledOnce();});
});
