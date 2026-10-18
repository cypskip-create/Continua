import {createHash} from 'node:crypto';
import {rateLimit} from 'express-rate-limit';
import {env} from '../../config/index.js';
import {cache} from '../../storage/cache.js';

export const incrementScript="local n=redis.call('INCR',KEYS[1]); local ttl=redis.call('PTTL',KEYS[1]); if ttl<0 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); ttl=tonumber(ARGV[1]); end; return {n,ttl};";
const decrementScript="local n=tonumber(redis.call('GET',KEYS[1]) or '0'); if n>0 then return redis.call('DECR',KEYS[1]); end; return 0;";
let activeCommands=0;
export class RateStoreUnavailable extends Error {constructor(){super('Request protection unavailable');}}
export class BoundedMemoryRateStore {
 localKeys=true;entries=new Map();
 constructor(maximum=10000){if(!Number.isInteger(maximum)||maximum<1||maximum>10000)throw Error('Invalid memory counter capacity');this.maximum=maximum;}
 init(options){
  if(!Number.isInteger(options.windowMs)||options.windowMs<1||options.windowMs>3600000)throw Error('Invalid rate window');
  this.windowMs=options.windowMs;this.timer=setInterval(()=>this.prune(),Math.min(options.windowMs,15000));this.timer.unref();
 }
 prune(){const now=Date.now();for(const [key,value]of this.entries)if(value.resetTime.getTime()<=now)this.entries.delete(key);}
 async increment(key){
  const now=Date.now();let entry=this.entries.get(key);
  if(entry&&entry.resetTime.getTime()<=now){this.entries.delete(key);entry=undefined;}
  if(!entry){
   if(this.entries.size>=this.maximum){this.prune();if(this.entries.size>=this.maximum)throw new RateStoreUnavailable();}
   entry={totalHits:0,resetTime:new Date(now+this.windowMs)};this.entries.set(key,entry);
  }
  entry.totalHits++;return {...entry};
 }
 async decrement(key){const entry=this.entries.get(key);if(entry&&entry.totalHits>0)entry.totalHits--;}
 async resetKey(key){this.entries.delete(key);}
 async get(key){const entry=this.entries.get(key);return entry&&entry.resetTime.getTime()>Date.now()?{...entry}:undefined;}
 shutdown(){clearInterval(this.timer);}
}
export class SharedRateStore {
 localKeys=false;
 constructor(scope,provider=cache,namespace=env.CACHE_NAMESPACE??'continua:production:cache:v2'){
  if(!/^[a-z0-9-]{1,40}$/.test(scope)||!/^[a-zA-Z0-9:_-]{1,80}$/.test(namespace))throw Error('Invalid rate counter namespace');
  this.prefix=namespace+':limits:'+scope+':';this.provider=provider;
 }
 init(options){if(!Number.isInteger(options.windowMs)||options.windowMs<1||options.windowMs>3600000)throw Error('Invalid rate window');this.windowMs=options.windowMs;}
 key(identity){if(typeof identity!=='string'||identity.length<1||identity.length>2048)throw new RateStoreUnavailable();return this.prefix+createHash('sha256').update(identity).digest('hex');}
 async command(parts){
  if(activeCommands>=32||typeof this.provider.rateLimitCommand!=='function')throw new RateStoreUnavailable();
  activeCommands++;
  try{return await this.provider.rateLimitCommand(parts);}catch{throw new RateStoreUnavailable();}finally{activeCommands--;}
 }
 async increment(identity){
  const value=await this.command(['EVAL',incrementScript,1,this.key(identity),this.windowMs]);
  if(!Array.isArray(value)||value.length!==2||!Number.isSafeInteger(value[0])||value[0]<1||!Number.isInteger(value[1])||value[1]<0||value[1]>this.windowMs)throw new RateStoreUnavailable();
  return {totalHits:value[0],resetTime:new Date(Date.now()+Math.max(1,value[1]))};
 }
 async decrement(identity){await this.command(['EVAL',decrementScript,1,this.key(identity)]);}
 async resetKey(identity){await this.command(['DEL',this.key(identity)]);}
}
/** A configured remote counter never falls back to an empty memory bucket. */
export function protectedRateLimit(options,scope){
 const remote=env.CACHE_DRIVER==='redis'||env.CACHE_DRIVER==='upstash';
 const limiter=rateLimit({...options,store:remote?new SharedRateStore(scope):new BoundedMemoryRateStore(),passOnStoreError:false});
 const guarded=(req,res,next)=>limiter(req,res,error=>{
  if(error instanceof RateStoreUnavailable)return res.status(503).set('Retry-After','2').json({error:'Request protection is temporarily unavailable. Please retry.',code:'RATE_LIMIT_STORE_UNAVAILABLE'});
  next(error);
 });
 return Object.assign(guarded,{resetKey:limiter.resetKey,getKey:limiter.getKey});
}
