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
