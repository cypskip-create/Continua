import test from 'node:test';import assert from 'node:assert/strict';
import worker from './worker.mjs';
import {imageFormat} from './media.mjs';
const owner='11111111-1111-4111-8111-111111111111';
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0]);
function fixture(t){
 const previous=globalThis.fetch;t.after(()=>{globalThis.fetch=previous;});
 const objects=new Map(),calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({user:{id:owner,aud:'authenticated'},claims:{sub:owner,role:'authenticated',aud:'continua'}});};
 const env={MEDIA_STORAGE_ENABLED:'true',AUTH_PROVIDER:'better-auth',BACKEND_ORIGIN:'https://backend.onrender.com',BACKEND_API_KEY:'server-key',EDGE_ORIGIN_SECRET:'s'.repeat(32),AUTH_RATE_LIMIT:{limit:async()=>({success:true})},MEDIA_RATE_LIMIT:{limit:async()=>({success:true})},MEDIA_BUCKET:{
  put:async(key,body,options)=>objects.set(key,{body:body.slice(),options}),
  get:async key=>{const value=objects.get(key);return value?{body:value.body,size:value.body.length,httpEtag:'"fixture"'}:null;},
  head:async key=>{const value=objects.get(key);return value?{size:value.body.length,httpEtag:'"fixture"'}:null;},
  delete:async key=>objects.delete(key)
 }};
 const upload=(body=png,headers={})=>new Request('https://site.workers.dev/api/v1/media/avatars',{method:'POST',body,headers:{Origin:'https://site.workers.dev','X-User-Token':'fixture-user','CF-Connecting-IP':'203.0.113.2','Content-Type':'image/png',...headers}});
 return {env,objects,calls,upload};
}
test('authenticated upload pins identity, checksum, bucket and safe content type',async t=>{
 const {env,objects,calls,upload}=fixture(t);const response=await worker.fetch(upload(),env);
 assert.equal(response.status,201);const {url}=await response.json(),key=new URL(url).pathname.slice(7);
 assert.match(key,new RegExp('^avatars/'+owner+'/'));assert.equal(objects.size,1);
 assert.equal(calls[0].url.href,'https://backend.onrender.com/api/v1/identity/verify');assert.equal(calls[0].options.redirect,'manual');
 assert.equal(objects.get(key).options.sha256.byteLength,32);assert.equal(objects.get(key).options.customMetadata.owner,owner);
 const image=await worker.fetch(new Request(url),env);assert.equal(image.status,200);assert.equal(image.headers.get('Content-Type'),'image/png');assert.equal(image.headers.get('X-Content-Type-Options'),'nosniff');assert.deepEqual(new Uint8Array(await image.arrayBuffer()),png);
 const head=await worker.fetch(new Request(url,{method:'HEAD'}),env);assert.equal(head.status,200);assert.equal(await head.text(),'');
});
test('invalid auth and cross-site requests never write images',async t=>{
 const {env,objects,upload}=fixture(t);
 assert.equal((await worker.fetch(upload(png,{Origin:'https://evil.example'}),env)).status,403);
 assert.equal((await worker.fetch(upload(png,{'X-User-Token':''}),env)).status,401);
 globalThis.fetch=async()=>Response.json({error:'revoked'},{status:401});assert.equal((await worker.fetch(upload(),env)).status,401);assert.equal(objects.size,0);
 globalThis.fetch=async()=>Response.json({user:{id:owner,aud:'authenticated',is_anonymous:true},claims:{sub:owner,role:'authenticated',aud:'continua'}});assert.equal((await worker.fetch(upload(),env)).status,401);
});
test('existing owned Vercel sites retain image uploads with exact-origin CORS',async t=>{
 const {env,upload}=fixture(t),origin='https://continua-cypskip-creates-projects.vercel.app';
 const preflight=await worker.fetch(new Request('https://site.workers.dev/api/v1/media/avatars',{method:'OPTIONS',headers:{Origin:origin}}),env);
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
 const response=await worker.fetch(upload(png,{Origin:origin,'Sec-Fetch-Site':'cross-site'}),env);
 assert.equal(response.status,201);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
 assert.equal((await worker.fetch(upload(png,{Origin:'https://unrelated.vercel.app'}),env)).status,403);
});
test('size, raster signature and media-specific rate limits fail closed',async t=>{
 const {env,objects,upload}=fixture(t);
 assert.equal((await worker.fetch(upload('<svg/>',{'Content-Type':'image/svg+xml'}),env)).status,415);
 assert.equal((await worker.fetch(upload(png,{'Content-Type':'image/jpeg'}),env)).status,415);
 assert.equal((await worker.fetch(upload(new Uint8Array(5*1024*1024+1)),env)).status,413);
 assert.equal((await worker.fetch(upload(png,{'Content-Length':'99999999'}),env)).status,413);
 env.MEDIA_RATE_LIMIT.limit=async()=>({success:false});const limited=await worker.fetch(upload(),env);assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'60');assert.equal(objects.size,0);
 delete env.MEDIA_RATE_LIMIT;assert.equal((await worker.fetch(upload(),env)).status,503);
});
test('private financial objects and other owners cannot be selected',async t=>{
 const {env,objects,upload}=fixture(t);const created=await worker.fetch(upload(),env),{url}=await created.json();
 assert.equal((await worker.fetch(new Request('https://site.workers.dev/media/processed/research/private.json.gz'),env)).status,404);
 const remove=new URL(url);remove.pathname='/api/v1/media/object/'+remove.pathname.slice(7);
 const headers={Origin:remove.origin,'X-User-Token':'fixture-user','CF-Connecting-IP':'203.0.113.2'};
 globalThis.fetch=async()=>Response.json({user:{id:'22222222-2222-4222-8222-222222222222'},claims:{sub:'22222222-2222-4222-8222-222222222222',role:'authenticated',aud:'continua'}});
 assert.equal((await worker.fetch(new Request(remove,{method:'DELETE',headers}),env)).status,403);assert.equal(objects.size,1);
 globalThis.fetch=async()=>Response.json({user:{id:owner},claims:{sub:owner,role:'authenticated',aud:'continua'}});assert.equal((await worker.fetch(new Request(remove,{method:'DELETE',headers}),env)).status,204);assert.equal(objects.size,0);
});
test('unconfigured media is unavailable and all accepted raster signatures are explicit',async t=>{
 const {upload}=fixture(t);assert.equal((await worker.fetch(upload(),{})).status,503);
 assert.equal(imageFormat(Uint8Array.from([255,216,255])),'jpg');
 assert.equal(imageFormat(new TextEncoder().encode('RIFF0000WEBP')),'webp');
 assert.equal(imageFormat(new TextEncoder().encode('GIF89a')),'gif');assert.equal(imageFormat(new TextEncoder().encode('<html>')),null);
});

test('Neon uploads use the owned live-session verifier and need no Supabase key',async t=>{
 const {env,objects,upload}=fixture(t);Object.assign(env,{AUTH_PROVIDER:'better-auth',BACKEND_ORIGIN:'https://backend.onrender.com',BACKEND_API_KEY:'server-key',EDGE_ORIGIN_SECRET:'s'.repeat(32),AUTH_RATE_LIMIT:{limit:async()=>({success:true})}});
 let target,headers;globalThis.fetch=async(url,options)=>{target=url;headers=options.headers;return Response.json({user:{id:owner},claims:{sub:owner,role:'authenticated',aud:'continua'}});};
 assert.equal((await worker.fetch(upload(),env)).status,201);assert.equal(target.href,'https://backend.onrender.com/api/v1/identity/verify');assert.equal(headers.get('x-api-key'),'server-key');assert.equal(headers.get('x-user-token'),'fixture-user');assert.equal(objects.size,1);
 globalThis.fetch=async()=>Response.json({user:{id:owner},claims:{sub:'another-owner',role:'authenticated',aud:'continua'}});assert.equal((await worker.fetch(upload(),env)).status,401);assert.equal(objects.size,1);
 globalThis.fetch=async()=>new Response('{"error":"revoked"}',{status:401,headers:{'Content-Type':'application/json'}});assert.equal((await worker.fetch(upload(),env)).status,401);assert.equal(objects.size,1);
});
