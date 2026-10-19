import test from 'node:test';
import assert from 'node:assert/strict';
import {session,marker,stepUpAllowed} from './session.mjs';
const env={SUPABASE_PUBLISHABLE_KEY:'fixture-publishable'};
const refresh='refresh_fixture_0123456789';
const request=(path='/auth/v1/token?grant_type=password',body={email:'fixture@example.com',password:'fixture-only'},headers={})=>new Request('https://site.workers.dev/api/session'+path,{method:'POST',headers:{Origin:'https://site.workers.dev','X-Continua-Session':'1','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('login keeps refresh credentials out of JSON and sets private host-only cookies',async()=>{
 const result=await session(request(),env,async(url,options)=>{assert.equal(url.origin,'https://jjsetogmnumoudrovpzn.supabase.co');assert.equal(options.headers.get('apikey'),env.SUPABASE_PUBLISHABLE_KEY);return Response.json({access_token:'fixture-access',refresh_token:refresh});});
 assert.equal((await result.json()).refresh_token,marker);
 const cookies=result.headers.getSetCookie();assert.equal(cookies.length,2);assert.match(cookies[0],/HttpOnly; Secure; SameSite=Strict/);assert.match(cookies[0],/^__Host-/);assert.equal(result.headers.get('Cache-Control'),'private, no-store');
});
test('refresh uses the private cookie instead of an untrusted marker or supplied token',async()=>{
 let supplied;const result=await session(request('/auth/v1/token?grant_type=refresh_token',{refresh_token:marker},{Cookie:'__Host-continua-refresh='+refresh}),env,async(url,options)=>{supplied=JSON.parse(options.body).refresh_token;return Response.json({access_token:'fixture',refresh_token:refresh+'_rotated'});});
 assert.equal(supplied,refresh);assert.equal((await result.json()).refresh_token,marker);
});
test('cross-origin, missing CSRF header, unknown paths and unsafe redirects never reach Auth',async()=>{
 let calls=0;const provider=async()=>{calls++;throw Error('must not call');};
 assert.equal((await session(request(undefined,undefined,{Origin:'https://attacker.invalid'}),env,provider)).status,403);
 assert.equal((await session(request(undefined,undefined,{'X-Continua-Session':''}),env,provider)).status,403);
 assert.equal((await session(request('/auth/v1/admin/users'),env,provider)).status,404);
 assert.equal((await session(request('/auth/v1/signup?redirect_to=https://attacker.invalid'),env,provider)).status,400);assert.equal(calls,0);
});
test('missing and invalid refresh sessions clear cookies; provider outages do not',async()=>{
 const missing=await session(request('/auth/v1/token?grant_type=refresh_token',{refresh_token:marker}),env);assert.equal(missing.status,401);assert.match(missing.headers.getSetCookie()[0],/Max-Age=0/);
 const req=()=>request('/auth/v1/token?grant_type=refresh_token',{refresh_token:marker},{Cookie:'__Host-continua-refresh='+refresh});
 const failed=await session(req(),env,async()=>{throw Error('private provider exception');});assert.equal(failed.status,503);assert.equal(failed.headers.get('Set-Cookie'),null);assert.doesNotMatch(await failed.text(),/private provider/);
 const invalid=await session(req(),env,async()=>Response.json({error_code:'refresh_token_not_found'},{status:400}));assert.match(invalid.headers.getSetCookie()[0],/Max-Age=0/);
});
test('logout clears both cookies and no upstream redirect is followed',async()=>{
 const result=await session(request('/auth/v1/logout'),env,async()=>new Response(null,{status:204}));assert.equal(result.status,204);assert.equal(result.headers.getSetCookie().length,2);
 assert.equal((await session(request(),env,async()=>new Response(null,{status:302,headers:{Location:'https://attacker.invalid'}}))).status,502);
});

test('sensitive changes require provider-bound identity, fresh authentication and verified MFA',()=>{
 const now=1800000000000,user={id:'fixture-owner',factors:[{status:'verified'}]};
 const claims={sub:user.id,aal:'aal2',amr:[{method:'mfa/totp',timestamp:now/1000-60}]};
 assert.equal(stepUpAllowed(claims,user,now),true);
 assert.equal(stepUpAllowed({...claims,aal:'aal1'},user,now),false);
 assert.equal(stepUpAllowed({...claims,sub:'another-owner'},user,now),false);
 assert.equal(stepUpAllowed({...claims,amr:[{method:'token_refresh',timestamp:now/1000}]},user,now),false);
 assert.equal(stepUpAllowed({...claims,amr:[{method:'password',timestamp:now/1000-601}]},user,now),false);
 assert.equal(stepUpAllowed({...claims,amr:[{method:'password',timestamp:now/1000+60}]},user,now),false);
});
