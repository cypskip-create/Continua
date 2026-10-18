import {afterEach,expect,it,vi} from 'vitest';
import express from 'express';
vi.mock('../src/config/index.js',()=>({env:{NODE_ENV:'test',LOG_LEVEL:'silent',RATE_LIMIT_WINDOW_MS:60000,RATE_LIMIT_MAX_DEFAULT:2}}));
import {edgeClientIdentity} from '../src/api/middleware/edgeClientIdentity.js';
import {preAuthenticationRateLimit} from '../src/api/middleware/preAuthenticationRateLimit.js';
import {apiRateLimit} from '../src/api/middleware/rateLimit.js';
const secret='fixture-server-secret-'.repeat(3);let server;
afterEach(async()=>{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=undefined;}});
async function appUrl({configured=secret,verified=false}={}){
 const app=express();app.use(edgeClientIdentity(configured));
 if(verified){app.use((req,_res,next)=>{req.apiKey={id:'same-website-key',rateLimitPerMin:2};next();});app.use(apiRateLimit());}
 else app.use(preAuthenticationRateLimit(2));
 app.get('/data',(_req,res)=>res.json({data:[]}));
 server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
 return 'http://127.0.0.1:'+server.address().port+'/data';
}
function headers(ip,key=secret){return {'X-Continua-Client-IP':ip,'X-Continua-Edge-Secret':key};}
it('separates real edge visitors before authentication and at the API-key limit',async()=>{
 for(const verified of [false,true]){
  const url=await appUrl({verified});
  expect((await fetch(url,{headers:headers('192.0.2.1')})).status).toBe(200);
  expect((await fetch(url,{headers:headers('192.0.2.1')})).status).toBe(200);
  const limited=await fetch(url,{headers:headers('192.0.2.1')});expect(limited.status).toBe(429);expect(limited.headers.get('Retry-After')).not.toBeNull();
  expect((await fetch(url,{headers:headers('192.0.2.2')})).status).toBe(200);
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=undefined;
 }
});
it('forged assertions cannot rotate the connection bucket',async()=>{
 const url=await appUrl();
 for(let i=1;i<=3;i++)expect((await fetch(url,{headers:headers('192.0.2.'+i,'forged-secret-'.repeat(4))})).status).toBe(i<3?200:429);
});
it('invalid addresses and comma-separated identities cannot become trusted visitors',async()=>{
 const url=await appUrl();
 const ips=['192.0.2.1:80','192.0.2.1, 192.0.2.2','fe80::1%zone'];
 for(let i=0;i<ips.length;i++)expect((await fetch(url,{headers:headers(ips[i])})).status).toBe(i<2?200:429);
});
it('mapped IPv4 and IPv6 subnet variants use normalized buckets',async()=>{
 const url=await appUrl();
 expect((await fetch(url,{headers:headers('192.0.2.1')})).status).toBe(200);
 expect((await fetch(url,{headers:headers('::ffff:c000:201')})).status).toBe(200);
 expect((await fetch(url,{headers:headers('::ffff:192.0.2.1')})).status).toBe(429);
 expect((await fetch(url,{headers:headers('2001:db8:1234:5600::1')})).status).toBe(200);
 expect((await fetch(url,{headers:headers('2001:db8:1234:5601::2')})).status).toBe(200);
 expect((await fetch(url,{headers:headers('2001:db8:1234:56ff::3')})).status).toBe(429);
 expect((await fetch(url,{headers:headers('2001:db8:1234:5700::1')})).status).toBe(200);
});
it('rejects malformed server configuration and never trusts unconfigured headers',async()=>{
 for(const invalid of ['short',' '+secret,secret+' ',secret.repeat(20)])expect(()=>edgeClientIdentity(invalid)).toThrow('Invalid edge');
 const app=express();app.use(edgeClientIdentity());app.use(preAuthenticationRateLimit(1));app.get('/data',(_req,res)=>res.sendStatus(200));
 server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
 const url='http://127.0.0.1:'+server.address().port+'/data';
 expect((await fetch(url,{headers:headers('192.0.2.1')})).status).toBe(200);
 expect((await fetch(url,{headers:headers('192.0.2.2')})).status).toBe(429);
});
