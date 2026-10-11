import {describe,it,expect} from 'vitest';
import {cache} from '../src/storage/cache.js';
describe('cache concurrent misses',()=>{
 it('shares one loader across a burst of identical requests',async()=>{
   let calls=0; let resolve!:(value:string)=>void;
   const load=()=>{calls++;return new Promise<string>(r=>{resolve=r;});};
   const jobs=Array.from({length:20},()=>cache.getOrSet('test:single-flight',1000,load));
   await Promise.resolve();await Promise.resolve();
   expect(calls).toBe(1);resolve('saved');
   expect(await Promise.all(jobs)).toEqual(Array(20).fill('saved'));
 });
 it('releases failed loaders so the next request can recover',async()=>{
   await expect(cache.getOrSet('test:recover',1000,async()=>{throw new Error('down');})).rejects.toThrow('down');
   expect(await cache.getOrSet('test:recover',1000,async()=>42)).toBe(42);
 });
});
