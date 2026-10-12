import test from 'node:test';import assert from 'node:assert/strict';
import worker,{upstreamUrl,boundedBody,publicTtl} from './worker.mjs';
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
