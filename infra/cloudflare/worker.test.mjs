import test from 'node:test';import assert from 'node:assert/strict';
import worker,{upstreamUrl,boundedBody,publicTtl,publicCacheKey} from './worker.mjs';

test('only the owned edge supplies trusted internal client identity',async t=>{
 const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});
 let headers;globalThis.fetch=async(_url,options)=>{headers=options.headers;return new Response('{"data":[]}',{headers:{'Content-Type':'application/json'}});};
 const env={BACKEND_ORIGIN:'https://api.onrender.com',BACKEND_API_KEY:'fixture'};
 const request=new Request('https://site.workers.dev/api/v1/quotes',{headers:{'CF-Connecting-IP':'203.0.113.8','X-Continua-Edge-Secret':'forged','X-Continua-Client-IP':'203.0.113.9'}});
 assert.equal((await worker.fetch(request,env)).status,200);
 assert.equal(headers.get('X-Continua-Edge-Secret'),null);assert.equal(headers.get('X-Continua-Client-IP'),null);
 env.EDGE_ORIGIN_SECRET='s'.repeat(32);
 assert.equal((await worker.fetch(request,env)).status,200);
 assert.equal(headers.get('X-Continua-Edge-Secret'),env.EDGE_ORIGIN_SECRET);assert.equal(headers.get('X-Continua-Client-IP'),'203.0.113.8');
 env.EDGE_ORIGIN_SECRET='short';assert.equal((await worker.fetch(request,env)).status,503);
});
test('gateway pins upstream and rejects administration and webhooks',()=>{
 assert.equal(upstreamUrl('https://site.workers.dev/api/v1/quotes?symbols=KPC','https://api.onrender.com').href,'https://api.onrender.com/api/v1/quotes?symbols=KPC');
 for(const path of ['/admin','/api/v1/admin/financials','/api/v1/billing/paystack/webhook'])assert.throws(()=>upstreamUrl('https://site.workers.dev'+path,'https://api.onrender.com'));
 assert.throws(()=>upstreamUrl('https://site.workers.dev/api/v1/quotes','http://localhost'));
});
test('request-size limit does not trust Content-Length',async()=>{await assert.rejects(boundedBody(new Request('https://example.com',{method:'POST',body:'too big'}),3));});
test('sensitive GETs have no public TTL',()=>{assert.equal(publicTtl('/api/v1/billing/verify/ref'),0);assert.equal(publicTtl('/api/v1/engine/portfolio'),0);assert.equal(publicTtl('/api/v1/quotes'),5);});
test('unconfigured proxy never sends an upstream request or returns cacheable data',async()=>{const response=await worker.fetch(new Request('https://site.workers.dev/api/v1/quotes'),{BACKEND_ORIGIN:'https://api.onrender.com'});assert.equal(response.status,503);assert.equal(response.headers.get('Cache-Control'),'no-store');});
test('encoded admin and webhook paths cannot bypass route restrictions',()=>{
 for(const path of ['/api/v1/%61dmin/financials','/api/v1/billing/paystack/%77ebhook','/api/v1/%2561dmin','/api/v1/a%2fb','/api/v1/%'])assert.throws(()=>upstreamUrl('https://site.workers.dev'+path,'https://api.onrender.com'));
});
test('checkout assets receive no-store and security headers',async()=>{
 const response=await worker.fetch(new Request('https://site.workers.dev/checkout'),{ASSETS:{fetch:async()=>new Response('<html></html>')}});
 assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Frame-Options'),'DENY');assert.equal(response.headers.get('Strict-Transport-Security'),'max-age=31536000');
});
test('cross-site and non-JSON mutations are rejected before upstream access',async()=>{
 assert.equal((await worker.fetch(new Request('https://site.workers.dev/api/v1/billing/native-checkout',{method:'POST',headers:{'Sec-Fetch-Site':'cross-site'}}),{})).status,403);
 assert.equal((await worker.fetch(new Request('https://site.workers.dev/api/v1/billing/native-checkout',{method:'POST',body:'x'}),{})).status,415);
});
test('public caching is exact-route, parameter-scoped and excludes every account credential',()=>{
 const env={PUBLIC_EDGE_CACHE:'true'};
 for(const path of ['/api/v1/quotes/private','/api/v1/quotes/KCB/history','/api/v1/engine/KCB','/api/v1/billing/verify/ref','/api/v1/quotes?user_id=other','/api/v1/indices?exchange=NSE&exchange=OTHER'])assert.equal(publicCacheKey(new Request('https://site.workers.dev'+path),env),null);
 for(const name of ['Authorization','Cookie','X-User-Token','X-Supabase-Key'])assert.equal(publicCacheKey(new Request('https://site.workers.dev/api/v1/quotes',{headers:{[name]:'fixture'}}),env),null);
 assert.equal(publicCacheKey(new Request('https://site.workers.dev/api/v1/quotes'),{}),null);
 assert.equal(publicCacheKey(new Request('https://site.workers.dev/api/v1/quotes?symbols=KCB&exchange=NSE'),env).ttl,5);
});
test('public cache hit avoids Render while clients still receive no-store',async t=>{
 const previousFetch=globalThis.fetch,previousCaches=globalThis.caches;let calls=0;const objects=new Map();
 t.after(()=>{globalThis.fetch=previousFetch;globalThis.caches=previousCaches;});
 globalThis.caches={default:{match:async key=>objects.get(key.url)?.clone(),put:async(key,response)=>objects.set(key.url,response)}};
 globalThis.fetch=async()=>{calls++;return new Response('{"data":[{"symbol":"KCB"}]}',{headers:{'Content-Type':'application/json','Vary':'Origin','Cache-Control':'no-store'}})};
 const request=new Request('https://site.workers.dev/api/v1/quotes?symbols=KCB'),env={BACKEND_ORIGIN:'https://api.onrender.com',BACKEND_API_KEY:'fixture',PUBLIC_EDGE_CACHE:'true'};
 const first=await worker.fetch(request,env);assert.equal(first.headers.get('X-Continua-Edge-Cache'),'MISS');await first.text();
 const second=await worker.fetch(request,env);assert.equal(second.headers.get('X-Continua-Edge-Cache'),'HIT');assert.equal(second.headers.get('Cache-Control'),'no-store');await second.text();assert.equal(calls,1);
 assert.equal([...objects.values()][0].headers.get('Cache-Control'),'public, max-age=5');
});
test('personal requests and upstream failures never enter the public edge cache',async t=>{
 const previousFetch=globalThis.fetch,previousCaches=globalThis.caches;let reads=0,writes=0;
 t.after(()=>{globalThis.fetch=previousFetch;globalThis.caches=previousCaches;});
 globalThis.caches={default:{match:async()=>{reads++;return undefined;},put:async()=>{writes++;}}};
 globalThis.fetch=async()=>new Response('{"error":"unavailable"}',{status:503,headers:{'Content-Type':'application/json'}});
 const env={BACKEND_ORIGIN:'https://api.onrender.com',BACKEND_API_KEY:'fixture',PUBLIC_EDGE_CACHE:'true'};
 for(const path of ['/api/v1/billing/verify/ref','/api/v1/engine/portfolio/overview'])assert.equal((await worker.fetch(new Request('https://site.workers.dev'+path),env)).status,503);
 assert.equal(reads,0);assert.equal(writes,0);
 await worker.fetch(new Request('https://site.workers.dev/api/v1/quotes',{headers:{'X-User-Token':'fixture'}}),env);assert.equal(reads,0);
 await worker.fetch(new Request('https://site.workers.dev/api/v1/quotes'),env);assert.equal(reads,1);assert.equal(writes,0);
});
