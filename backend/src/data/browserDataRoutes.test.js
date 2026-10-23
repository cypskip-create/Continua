import {afterEach,describe,expect,it,vi} from 'vitest';
import express from 'express';
import {createBrowserDataRouter} from './browserDataRoutes.js';
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
 it('preserves community safety RPCs and returns JSON null for SQL void',async()=>{const f=await fixture();for(const [name,body] of [['community_set_safety',{p_target:'fixture-user',p_kind:'block',p_enabled:true}],['community_submit_report',{p_kind:'post',p_target:'fixture-post',p_reason:'Other',p_details:'detail'}]]){const response=await post(f.url+'/rpc/'+name,body);expect(response.status).toBe(200);expect(await response.json()).toBe(null);}expect(f.client.query.mock.calls.some(([sql])=>sql==='SET LOCAL ROLE authenticated')).toBe(true);expect(f.client.query.mock.calls.find(([sql])=>sql.includes('public."community_set_safety"'))[1]).toEqual(['fixture-user','block',true]);});
 it('rejects unregistered RPCs and unexpected arguments before acquiring SQL connections',async()=>{const f=await fixture();expect((await post(f.url+'/rpc/arbitrary_function',{})).status).toBe(404);expect((await post(f.url+'/rpc/community_set_safety',{p_target:'x',p_kind:'block',p_enabled:true,role:'service_role'})).status).toBe(400);expect(f.database.connect).not.toHaveBeenCalled();});
 it('rejects invalid credentials rather than falling back to anonymous access',async()=>{const f=await fixture(async()=>{throw Error('revoked');});const response=await fetch(f.url+'/profiles_public',{headers:{'X-User-Token':'revoked'}});expect(response.status).toBe(401);expect((await response.json()).code).toBe('AUTH_INVALID');expect(f.database.connect).not.toHaveBeenCalled();});
 it('preserves anonymous access to public company-processing receipts',async()=>{const f=await fixture();const response=await post(f.url+'/rpc/company_processing_status',{p_symbol:'TEST'},null);expect(response.status).toBe(200);expect(await response.json()).toEqual({});expect(f.client.query.mock.calls.some(([sql])=>sql==='SET LOCAL ROLE anon')).toBe(true);expect(f.client.query.mock.calls.some(([sql])=>sql==='SELECT public.continua_session_guard()')).toBe(false);});
 it('requires a session for RPC mutations',async()=>{const f=await fixture();expect((await post(f.url+'/rpc/community_set_safety',{p_target:'x',p_kind:'block',p_enabled:true},null)).status).toBe(401);expect(f.database.connect).not.toHaveBeenCalled();});
 it('rolls back SQL failures and releases the connection without exposing database messages',async()=>{const f=await fixture();f.client.query.mockImplementation(async sql=>{if(sql.includes('public."community_submit_report"'))throw Object.assign(Error('private database detail'),{code:'42501'});return {rows:[]};});const response=await post(f.url+'/rpc/community_submit_report',{p_kind:'post',p_target:'x',p_reason:'Other'});expect(response.status).toBe(403);expect(await response.text()).not.toContain('private database detail');expect(f.client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');expect(f.client.release).toHaveBeenCalledOnce();});
});
