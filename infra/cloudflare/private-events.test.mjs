import test from 'node:test';import assert from 'node:assert/strict';import {privateEvents} from './private-events.mjs';
const origin='https://continua.invalid',env={AUTH_PROVIDER:'better-auth',BACKEND_ORIGIN:'https://api.onrender.com',BACKEND_API_KEY:'server-only',EDGE_ORIGIN_SECRET:'s'.repeat(32)};
function request(path='',headers={}){return new Request(origin+'/api/v1/events'+path,{headers:{Upgrade:'websocket',Origin:origin,'CF-Connecting-IP':'203.0.113.8',...headers}});}
test('private socket proxy pins its destination and never forwards browser credentials',async t=>{
 const previous=globalThis.fetch;t.after(()=>globalThis.fetch=previous);let observed;
 const upgraded={status:101,webSocket:{fixture:true},headers:new Headers()};globalThis.fetch=async(url,options)=>{observed={url,options};return upgraded;};
 assert.equal(await privateEvents(request('',{Cookie:'private=secret','X-User-Token':'browser-jwt','X-API-Key':'forged'}),env),upgraded);
 assert.equal(observed.url.href,'https://api.onrender.com/api/v1/events');assert.equal(observed.options.headers['X-API-Key'],'server-only');assert.equal(observed.options.headers.Cookie,undefined);assert.equal(observed.options.headers['X-User-Token'],undefined);assert.equal(observed.options.redirect,'manual');assert.equal(observed.options.signal.aborted,false);
});
test('socket proxy rejects query credentials, foreign origins and non-upgrade requests',async()=>{
 for(const req of [request('?token=forbidden'),request('',{Origin:'https://attacker.invalid'}),request('',{'Sec-Fetch-Site':'cross-site'})])assert.equal((await privateEvents(req,env)).status,403);
 assert.equal((await privateEvents(new Request(origin+'/api/v1/events'),env)).status,426);assert.equal((await privateEvents(request(),{...env,AUTH_PROVIDER:'supabase'})).status,404);
 assert.equal((await privateEvents(request(),{...env,BACKEND_API_KEY:''})).status,503);assert.equal((await privateEvents(request(),{...env,EDGE_RATE_LIMIT:{limit:async()=>({success:false})}})).status,429);
});
test('upstream redirects and unexpected cookies never become subscription handshakes',async t=>{
 const previous=globalThis.fetch;t.after(()=>globalThis.fetch=previous);
 for(const response of [new Response(null,{status:302,headers:{Location:'https://attacker.invalid'}}),{status:101,webSocket:{},headers:new Headers({'Set-Cookie':'unexpected=secret'})}]){globalThis.fetch=async()=>response;assert.equal((await privateEvents(request(),env)).status,502);}
});
