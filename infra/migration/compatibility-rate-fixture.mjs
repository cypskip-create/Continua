// Dedicated local fixture only. Never reads REDIS_URL or production credentials.
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const origin=process.env.RATE_LIMIT_REDIS_FIXTURE_URL;
if(!origin)throw Error('Dedicated loopback Redis fixture required');
const target=new URL(origin);
if(target.protocol!=='redis:'||target.hostname!=='127.0.0.1'||!target.port||target.pathname!=='/14'||target.username||target.password||target.search||target.hash)throw Error('Refusing non-fixture Redis destination');
process.env.NODE_ENV='test';process.env.LOG_LEVEL='fatal';process.env.CACHE_DRIVER='memory';process.env.DATABASE_URL='postgresql://fixture:fixture@127.0.0.1:1/continua_native_fixture';
const {Redis}=await import('../../backend/node_modules/ioredis/built/index.js');
const {SharedRateStore,RateStoreUnavailable}=await import('../../backend/src/api/middleware/sharedRateStore.js');
const options={lazyConnect:true,enableOfflineQueue:false,maxRetriesPerRequest:0,connectTimeout:1000,commandTimeout:1500,retryStrategy:()=>null};
const a=new Redis(origin,options),b=new Redis(origin,options),namespace='continua-rate-fixture:'+randomUUID();
a.on('error',()=>{});b.on('error',()=>{});let checks=0;
const check=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
try{
 await Promise.all([a.connect(),b.connect()]);
 const first=new SharedRateStore('api',{rateLimitCommand:parts=>a.call(...parts)},namespace),second=new SharedRateStore('api',{rateLimitCommand:parts=>b.call(...parts)},namespace);
 for(const store of [first,second])store.init({windowMs:5000});
 const counts=await Promise.all(Array.from({length:30},(_,i)=>(i%2?first:second).increment('same-owner')));
 check(counts.map(row=>row.totalHits).sort((x,y)=>x-y),Array.from({length:30},(_,i)=>i+1));
 const restarted=new SharedRateStore('api',{rateLimitCommand:parts=>b.call(...parts)},namespace);restarted.init({windowMs:5000});
 check((await restarted.increment('same-owner')).totalHits,31);
 check((await a.pttl(first.key('same-owner')))>0,true);
 check((await second.increment('other-owner')).totalHits,1);
 const expiring=new SharedRateStore('expiry',{rateLimitCommand:parts=>a.call(...parts)},namespace);expiring.init({windowMs:80});
 check((await expiring.increment('client')).totalHits,1);await new Promise(resolve=>setTimeout(resolve,160));check((await expiring.increment('client')).totalHits,1);
 await a.set(first.key('corrupt'),'foreign-invalid-value');
 await assert.rejects(first.increment('corrupt'),RateStoreUnavailable);checks++;
 check(await a.get(first.key('corrupt')),'foreign-invalid-value');
 const keys=await a.keys(namespace+':*');check(keys.every(key=>!key.includes('same-owner')&&!key.includes('other-owner')),true);
 if(keys.length)await a.del(...keys);
 a.disconnect();await assert.rejects(first.increment('outage'),RateStoreUnavailable);checks++;
 console.log(JSON.stringify({checks,concurrentCalls:30,independentConnections:2,productionRequests:0,status:'passed'}));
}finally{a.disconnect();b.disconnect();}
