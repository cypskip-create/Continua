import {afterEach,describe,it,expect,vi} from 'vitest';
import {UpstashCache} from '../src/storage/upstashCache.js';
import type {ICache} from '../src/storage/cache.js';
function fallback(){const values=new Map<string,unknown>();return {get:async <T>(k:string)=>(values.get(k)??null) as T|null,set:async <T>(k:string,v:T)=>{values.set(k,v);},del:async(k:string)=>{values.delete(k);},getOrSet:async <T>(_k:string,_ttl:number,fn:()=>Promise<T>)=>fn()} satisfies ICache;}
afterEach(()=>vi.unstubAllGlobals());
describe('optional REST cache',()=>{
 it('rejects credentials sent to arbitrary hosts',()=>{expect(()=>new UpstashCache('https://example.com','test','test',fallback())).toThrow();});
 it('fails open to local values and invalidates them',async()=>{vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));const c=new UpstashCache('https://test.upstash.io','test','preview',fallback());await c.set('key',{value:1});expect(await c.get('key')).toEqual({value:1});await c.del('key');expect(await c.get('key')).toBeNull();});
 it('coalesces concurrent misses and namespaces requests',async()=>{const request=vi.fn().mockResolvedValue({ok:true,json:async()=>({result:null})});vi.stubGlobal('fetch',request);const c=new UpstashCache('https://test.upstash.io','test','preview',fallback());const compute=vi.fn(async()=>42);expect(await Promise.all([c.getOrSet('quote',1000,compute),c.getOrSet('quote',1000,compute)])).toEqual([42,42]);expect(compute).toHaveBeenCalledTimes(1);expect(request.mock.calls[0]?.[1].body).toBe('["GET","preview:quote"]');});
});
