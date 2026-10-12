import {afterEach,expect,it} from 'vitest';
import express from 'express';
import type {Server} from 'node:http';
import {preAuthenticationRateLimit} from '../src/api/middleware/preAuthenticationRateLimit.js';
import {errorHandler} from '../src/api/middleware/errorHandler.js';
let server:Server|undefined;
afterEach(async()=>{if(server)await new Promise<void>(r=>server!.close(()=>r()));server=undefined;});
it('limits unverified requests before remote auth while leaving health/webhooks separate',async()=>{
 const app=express();let remoteCalls=0;app.use('/api/v1',preAuthenticationRateLimit(2));app.get('/api/v1/engine/private',(_req,res)=>{remoteCalls++;res.sendStatus(401);});app.get('/api/v1/health',(_req,res)=>res.sendStatus(200));app.post('/api/v1/billing/paystack/webhook',(_req,res)=>res.sendStatus(200));
 server=await new Promise<Server>(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 expect((await fetch(url+'/api/v1/engine/private')).status).toBe(401);expect((await fetch(url+'/api/v1/engine/private')).status).toBe(401);expect((await fetch(url+'/api/v1/engine/private')).status).toBe(429);expect(remoteCalls).toBe(2);
 expect((await fetch(url+'/api/v1/health')).status).toBe(200);expect((await fetch(url+'/api/v1/billing/paystack/webhook',{method:'POST'})).status).toBe(200);
});
it('returns safe parser errors instead of logging/returning the submitted body',async()=>{
 const app=express();app.use(express.json({limit:'1kb'}));app.post('/data',(_req,res)=>res.sendStatus(200));app.use(errorHandler);server=await new Promise<Server>(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const bad=await fetch(url+'/data',{method:'POST',headers:{'content-type':'application/json'},body:'{"secret":"fixture"'});expect(bad.status).toBe(400);expect(await bad.text()).not.toContain('fixture');
 const large=await fetch(url+'/data',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'x'.repeat(2000)})});expect(large.status).toBe(413);
});
