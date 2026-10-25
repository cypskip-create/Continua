import test from 'node:test';import assert from 'node:assert/strict';import {ownedIdentity} from './identity.mjs';
const env={AUTH_PROVIDER:'better-auth',BACKEND_ORIGIN:'https://backend.onrender.com',BACKEND_API_KEY:'server-only',EDGE_ORIGIN_SECRET:'s'.repeat(32),AUTH_RATE_LIMIT:{limit:async()=>({success:true})}};
test('managed cookies require explicit isolated staging configuration and never reach the legacy provider',async()=>{
 const stage={...env,AUTH_PROVIDER:'neon-managed',NEON_AUTH_STAGING_ENABLED:'true',NEON_AUTH_BRANCH_ID:'br-lively-paper-b4oli11a'};let observed;
 const fetcher=async(url,input)=>{observed=input.headers;return Response.json({session:null},{headers:{'Set-Cookie':'__Secure-neon-auth.session_token=opaque; Path=/; HttpOnly; Secure; SameSite=Lax'}});};
 assert.equal((await ownedIdentity(request('/api/v1/identity/session',{Cookie:'__Secure-continua.session_token=legacy; __Secure-neon-auth.session_token=managed'}),stage,fetcher)).status,200);
 assert.equal(observed.get('Cookie'),'__Secure-neon-auth.session_token=managed');
 assert.equal((await ownedIdentity(request('/api/v1/identity/session'),{...stage,NEON_AUTH_BRANCH_ID:'br-noisy-block-b4z5yxup'},fetcher)).status,404);
 assert.equal((await ownedIdentity(request('/api/v1/identity/session'),env,fetcher)).status,502);
});
const request=(path,extra={})=>new Request('https://continua.workers.dev'+path,{headers:{Origin:'https://continua.workers.dev','X-Continua-Session':'1','CF-Connecting-IP':'203.0.113.1',...extra}});
const json=()=>new Response('{"session":null}',{headers:{'Content-Type':'application/json'}});

test('an exhausted identity bucket still permits bounded sign-out',async()=>{
 const keys=[];let signouts=0;
 const settings={...env,AUTH_RATE_LIMIT:{limit:async({key})=>{keys.push(key);return {success:key.endsWith(':signout')&&++signouts<=1};}}};
 assert.equal((await ownedIdentity(request('/api/v1/identity/session'),settings,async()=>{throw Error('must not forward');})).status,429);
 const logout=()=>new Request('https://continua.workers.dev/api/v1/identity/signout',{method:'POST',headers:{Origin:'https://continua.workers.dev','X-Continua-Session':'1','CF-Connecting-IP':'203.0.113.1','Content-Type':'application/json'},body:'{}'});
 assert.equal((await ownedIdentity(logout(),settings,async()=>Response.json({signedOut:true}))).status,200);
 assert.equal((await ownedIdentity(logout(),settings,async()=>{throw Error('must not forward');})).status,429);
 assert.deepEqual(keys,['203.0.113.1','203.0.113.1:signout','203.0.113.1:signout']);
});
test('owned auth is opt-in and rejects arbitrary provider routes',async()=>{for(const [path,settings,status]of [['/api/v1/identity/session',{},404],['/api/auth/arbitrary',env,404],['/api/v1/identity/provider/verify-email',env,404]]){let calls=0;assert.equal((await ownedIdentity(request(path),settings,async()=>{calls++;return json();})).status,status);assert.equal(calls,0);}});
test('owned auth rejects cross-site or unmarked cookie requests',async()=>{for(const headers of [{Origin:'https://attacker.example'},{'X-Continua-Session':'0'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await ownedIdentity(request('/api/v1/identity/session',headers),env,async()=>{throw Error('must not fetch');})).status,403);});
test('only owned cookies and server credentials reach the fixed backend',async()=>{let options,target;const result=await ownedIdentity(request('/api/v1/identity/session',{Cookie:'unrelated=private; __Secure-continua.session_token=opaque','X-API-Key':'forged','X-Continua-Client-IP':'forged'}),env,async(url,input)=>{target=url;options=input;return new Response('{"session":null}',{headers:{'Content-Type':'application/json','Set-Cookie':'__Secure-continua.session_token=refreshed; Path=/; HttpOnly; Secure; SameSite=Lax'}});});assert.equal(result.status,200);assert.equal(target.href,'https://backend.onrender.com/api/v1/identity/session');assert.equal(options.headers.get('cookie'),'__Secure-continua.session_token=opaque');assert.equal(options.headers.get('x-api-key'),'server-only');assert.equal(options.headers.get('X-Continua-Client-IP'),'203.0.113.1');assert.match(result.headers.get('Set-Cookie'),/HttpOnly/);assert.equal(result.headers.get('Cache-Control'),'private, no-store');});
test('broadened or script-readable upstream cookies fail closed',async()=>{for(const cookie of ['__Secure-continua.session_token=x; Domain=workers.dev; Path=/; HttpOnly; Secure; SameSite=Lax','__Secure-continua.session_token=x; Path=/; Secure; SameSite=Lax','unrelated=x; Path=/; HttpOnly; Secure; SameSite=Lax']){const result=await ownedIdentity(request('/api/v1/identity/session'),env,async()=>new Response('{}',{headers:{'Content-Type':'application/json','Set-Cookie':cookie}}));assert.equal(result.status,502);assert.equal(result.headers.get('set-cookie'),null);}});
test('verification callbacks permit navigation but restrict redirects to the same site',async()=>{for(const [location,status]of [['/auth?verified=true',302],['https://attacker.example',502]]){const result=await ownedIdentity(request('/api/auth/verify-email?token=fixture',{'Sec-Fetch-Site':'cross-site'}),env,async()=>new Response(null,{status:302,headers:{Location:location}}));assert.equal(result.status,status);}assert.equal((await ownedIdentity(request('/api/auth/verify-email?token=one&token=two'),env,async()=>{throw Error('must not fetch');})).status,400);});
test('HTML challenges and excessive JSON responses do not become auth data',async()=>{for(const response of [new Response('<html>challenge</html>',{headers:{'Content-Type':'text/html'}}),new Response(JSON.stringify({data:'x'.repeat(131072)}),{headers:{'Content-Type':'application/json'}})])assert.equal((await ownedIdentity(request('/api/v1/identity/session'),env,async()=>response)).status,502);});

test('Google callback forwards its exact issuer and rejects substitution or duplicate issuer parameters',async()=>{
 let target,calls=0;const fetcher=async url=>{calls++;target=url;return new Response(null,{status:302,headers:{Location:'/auth'}});};
 const callback='/api/auth/callback/google?code=synthetic-code&state=synthetic-state&iss=https%3A%2F%2Faccounts.google.com';
 assert.equal((await ownedIdentity(request(callback),env,fetcher)).status,302);
 assert.equal(target.searchParams.get('iss'),'https://accounts.google.com');assert.equal(calls,1);
 for(const path of [callback.replace('accounts.google.com','attacker.invalid'),callback+'&iss=https%3A%2F%2Faccounts.google.com','/api/auth/verify-email?token=synthetic&iss=https%3A%2F%2Faccounts.google.com'])assert.equal((await ownedIdentity(request(path),env,fetcher)).status,400);
 assert.equal(calls,1);
});
