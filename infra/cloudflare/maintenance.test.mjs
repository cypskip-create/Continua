import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduledMaintenance} from './maintenance.mjs';
import {upstreamUrl} from './worker.mjs';

test('application schedule stays opt-in and cannot be invoked through the browser proxy',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('Unexpected request');};
 try{await scheduledMaintenance({},{});await scheduledMaintenance({},{AUTH_PROVIDER:'better-auth',APPLICATION_SCHEDULE_ENABLED:'false'});assert.equal(calls,0);
  assert.throws(()=>upstreamUrl('https://continua.example/api/v1/internal/application-jobs','https://continua-backend.onrender.com'));
  assert.throws(()=>upstreamUrl('https://continua.example/api/v1/%69nternal/application-jobs','https://continua-backend.onrender.com'));
 }finally{globalThis.fetch=original;}
});
test('schedule uses only a dedicated header and a fixed backend without redirects',async()=>{
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options)=>{calls.push([String(url),options]);return new Response('{}',{status:200});};
 const env={AUTH_PROVIDER:'better-auth',APPLICATION_SCHEDULE_ENABLED:'true',BACKEND_ORIGIN:'https://continua-backend.onrender.com',AUTH_MAINTENANCE_SECRET:'test-only-maintenance-secret-'.repeat(2)};
 try{
  await scheduledMaintenance({},env);assert.equal(calls.length,1);
  assert.equal(calls[0][0],'https://continua-backend.onrender.com/api/v1/internal/application-jobs');
  assert.equal(calls[0][1].redirect,'manual');assert.deepEqual(Object.keys(calls[0][1].headers),['X-Continua-Maintenance-Key']);
  await assert.rejects(()=>scheduledMaintenance({},{...env,BACKEND_ORIGIN:'https://other.example'}));
  await assert.rejects(()=>scheduledMaintenance({},{...env,AUTH_MAINTENANCE_SECRET:''}));
  globalThis.fetch=async()=>new Response(null,{status:302,headers:{Location:'https://other.example'}});
  await assert.rejects(()=>scheduledMaintenance({},env));
 }finally{globalThis.fetch=original;}
});
test('cleanup deletes only queued owner prefixes and acknowledges complete pages',async()=>{
 const original=globalThis.fetch,owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',removed=[],calls=[];
 const env={AUTH_PROVIDER:'better-auth',APPLICATION_SCHEDULE_ENABLED:'true',BACKEND_ORIGIN:'https://continua-backend.onrender.com',AUTH_MAINTENANCE_SECRET:'test-only-maintenance-secret-'.repeat(2),MEDIA_BUCKET:{
  list:async({prefix,limit})=>{assert.equal(limit,100);return {objects:[{key:prefix+'fixture.png'}],truncated:false};},
  delete:async keys=>removed.push(...keys),
 }};
 // Match Workers, which rejects redirect:'error' before sending a request.
 globalThis.fetch=async(url,options)=>{assert.equal(options.redirect,'manual');calls.push([String(url),options]);return String(url).endsWith('/media-cleanup')?Response.json({owners:[owner]}):new Response(null,{status:204});};
 try{
  await scheduledMaintenance({},env);assert.equal(removed.length,3);
  assert.deepEqual(removed,['avatars','banners','post-images'].map(kind=>`${kind}/${owner}/fixture.png`));
  assert.equal(calls.at(-1)[0],'https://continua-backend.onrender.com/api/v1/internal/media-cleanup/complete');
  env.MEDIA_BUCKET.list=async()=>({objects:[{key:'avatars/another-owner/file.png'}],truncated:false});
  await assert.rejects(()=>scheduledMaintenance({},env),/escaped owner/);assert.equal(removed.length,3);
  globalThis.fetch=async url=>String(url).endsWith('/media-cleanup')?new Response(null,{status:302,headers:{Location:'https://other.invalid'}}):new Response(null,{status:204});
  await assert.rejects(()=>scheduledMaintenance({},env),/queue unavailable/);assert.equal(removed.length,3);
 }finally{globalThis.fetch=original;}
});
