import {afterEach,expect,it,vi} from 'vitest';import express from 'express';
const mocks=vi.hoisted(()=>({command:vi.fn(),env:{NODE_ENV:'test',LOG_LEVEL:'silent',CACHE_DRIVER:'upstash',CACHE_NAMESPACE:'fixture-limits'}}));
vi.mock('../src/config/index.js',()=>({env:mocks.env}));
vi.mock('../src/storage/cache.js',()=>({cache:{rateLimitCommand:mocks.command}}));
import {SharedRateStore,RateStoreUnavailable,BoundedMemoryRateStore,protectedRateLimit} from '../src/api/middleware/sharedRateStore.js';
import {UpstashCache} from '../src/storage/upstashCache.js';
let server;afterEach(async()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.clearAllMocks();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=undefined;}});
it('shares hashed identities across instances and separates protection scopes',async()=>{
 const values=new Map(),provider={rateLimitCommand:async parts=>{const key=parts[3],n=(values.get(key)||0)+1;values.set(key,n);return [n,500];}};
 const a=new SharedRateStore('api',provider,'fixture'),b=new SharedRateStore('api',provider,'fixture'),other=new SharedRateStore('preauth',provider,'fixture');
 for(const store of [a,b,other])store.init({windowMs:1000});
 expect((await a.increment('owner:private-IP')).totalHits).toBe(1);expect((await b.increment('owner:private-IP')).totalHits).toBe(2);expect((await other.increment('owner:private-IP')).totalHits).toBe(1);
 expect([...values.keys()].every(key=>!key.includes('private-IP')&&!key.includes('owner'))).toBe(true);
});
it('counter outages are retryable 503 responses and never open a fresh bucket',async()=>{
 mocks.command.mockRejectedValue(new Error('private-provider-detail'));
 const app=express();app.use(protectedRateLimit({windowMs:1000,limit:2,standardHeaders:'draft-7',legacyHeaders:false},'api'));app.get('/',(_req,res)=>res.sendStatus(200));
 server=await new Promise(resolve=>{const listening=app.listen(0,'127.0.0.1',()=>resolve(listening));});
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/');expect(response.status).toBe(503);expect(response.headers.get('Retry-After')).toBe('2');expect(await response.text()).not.toContain('private-provider-detail');
 mocks.command.mockResolvedValue([3,500]);const limited=await fetch('http://127.0.0.1:'+server.address().port+'/');expect(limited.status).toBe(429);
});
it('malformed remote responses fail closed',async()=>{
 for(const result of [null,[0,500],[1,-1],[1,2000],[1,500,1],['1',500]]){
  const store=new SharedRateStore('api',{rateLimitCommand:async()=>result},'fixture');store.init({windowMs:1000});await expect(store.increment('client')).rejects.toBeInstanceOf(RateStoreUnavailable);
 }
});
it('REST limiter commands bypass ordinary cache fallback',async()=>{
 const fallback={get:vi.fn(async()=>42)},cache=new UpstashCache('https://fixture.upstash.io','fixture-token','fixture',fallback);
 vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('offline');}));
 await expect(cache.rateLimitCommand(['EVAL','fixture',1,'key',1000])).rejects.toThrow();expect(fallback.get).not.toHaveBeenCalled();expect(await cache.get('key')).toBe(42);
});
it('local memory never evicts active counters to admit a flood of identities',async()=>{
 vi.useFakeTimers();const store=new BoundedMemoryRateStore(2);store.init({windowMs:1000});
 try{expect((await store.increment('a')).totalHits).toBe(1);await store.increment('b');await expect(store.increment('c')).rejects.toBeInstanceOf(RateStoreUnavailable);expect((await store.increment('a')).totalHits).toBe(2);await vi.advanceTimersByTimeAsync(1001);expect((await store.increment('c')).totalHits).toBe(1);expect(store.entries.size).toBeLessThanOrEqual(2);}finally{store.shutdown();}
});
it('provider concurrency is bounded until owned commands finish',async()=>{
 let release;const held=new Promise(resolve=>{release=resolve;}),store=new SharedRateStore('api',{rateLimitCommand:()=>held},'fixture');store.init({windowMs:1000});
 const pending=Array.from({length:32},(_,i)=>store.increment('client:'+i));await expect(store.increment('overflow')).rejects.toBeInstanceOf(RateStoreUnavailable);release([1,500]);await Promise.all(pending);
});
