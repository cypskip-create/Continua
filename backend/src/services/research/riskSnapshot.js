import {createHash} from 'node:crypto';
import {LRUCache} from 'lru-cache';
import {pythonCalculation} from './pythonCalculations.js';
const results=new LRUCache({max:32,maxSize:8*1024*1024,sizeCalculation:value=>Buffer.byteLength(JSON.stringify(value)),ttl:30_000});
const pending=new Map();
/** Owned results stay byte-bounded; public history still uses the shared cache.
 * Exact input revisions invalidate results; corrections expire within 30s.
 */
export async function riskSnapshot(owner,exchange,positions,histories) {
 const key=createHash('sha256').update(JSON.stringify(['risk-v1',owner,exchange,positions,histories])).digest('hex');
 const hit=results.get(key);if(hit)return hit;
 if(pending.has(key))return pending.get(key);
 const job=pythonCalculation('risk_intelligence',[positions,histories,new Date().toISOString()]).then(value=>{results.set(key,value);return value;});
 pending.set(key,job);
 try{return await job;}finally{pending.delete(key);}
}
