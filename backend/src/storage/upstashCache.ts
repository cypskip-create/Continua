import type {ICache} from './cache.js';
export class UpstashCache implements ICache {
 private pending=new Map<string,Promise<unknown>>();
 readonly metrics={hits:0,misses:0,failures:0};
 constructor(private url:string,private token:string,private namespace:string,private fallback:ICache){
  const endpoint=new URL(url);if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.upstash.io')||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!token||!/^[a-zA-Z0-9:_-]{1,80}$/.test(namespace))throw new Error('Invalid Upstash cache configuration');
 }
 private async command(parts:unknown[]){
  const response=await fetch(this.url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(1500),headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},body:JSON.stringify(parts)});
  if(!response.ok)throw new Error('Cache request failed');const data=await response.json() as {result?:unknown;error?:unknown};if(data.error)throw new Error('Cache command failed');return data.result;
 }
 async get<T>(key:string):Promise<T|null>{
  try{const raw=await this.command(['GET',`${this.namespace}:${key}`]);if(raw==null){this.metrics.misses++;return null;}if(typeof raw!=='string')throw new Error('Invalid cache value');const result=JSON.parse(raw) as T;this.metrics.hits++;return result;}
  catch{this.metrics.failures++;return this.fallback.get<T>(key);}
 }
 async set<T>(key:string,value:T,ttlMs=60000){
  await this.fallback.set(key,value,ttlMs);
  try{await this.command(['SET',`${this.namespace}:${key}`,JSON.stringify(value),'PX',Math.max(1,Math.floor(ttlMs))]);}catch{this.metrics.failures++;}
 }
 async del(key:string){await this.fallback.del(key);try{await this.command(['DEL',`${this.namespace}:${key}`]);}catch{this.metrics.failures++;}}
 async getOrSet<T>(key:string,ttlMs:number,fn:()=>Promise<T>):Promise<T>{
  const cached=await this.get<T>(key);if(cached!==null)return cached;
  const existing=this.pending.get(key);if(existing)return existing as Promise<T>;
  const job=Promise.resolve().then(fn).then(async value=>{await this.set(key,value,ttlMs);return value;});this.pending.set(key,job);
  try{return await job;}finally{this.pending.delete(key);}
 }
}
