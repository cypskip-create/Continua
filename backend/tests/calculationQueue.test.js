import {it,expect} from 'vitest';import {CalculationQueue} from '../src/services/research/calculationQueue.js';
it('queues short bursts, preserves the process limit and reserves risk capacity',async()=>{
 const queue=new CalculationQueue({concurrency:1,maximumWaiting:3,waitMs:1000}),events=[];let release;
 const first=queue.run(()=>new Promise(resolve=>{release=resolve;}));await Promise.resolve();
 const ordinary=queue.run(async()=>{events.push('ordinary');return 2;});
 await expect(queue.run(async()=>4)).rejects.toMatchObject({status:503});
 const risk=queue.run(async()=>{events.push('risk');return 3;},{priority:true});
 expect(queue.active).toBe(1);release(1);expect(await Promise.all([first,ordinary,risk])).toEqual([1,2,3]);expect(events).toEqual(['risk','ordinary']);
});
it('times out queued requests and releases capacity after failed calculations',async()=>{
 const queue=new CalculationQueue({concurrency:1,maximumWaiting:3,waitMs:10});let release;
 const first=queue.run(()=>new Promise(resolve=>{release=resolve;}));await Promise.resolve();
 await expect(queue.run(async()=>2)).rejects.toMatchObject({status:503});release(1);await first;
 await expect(queue.run(async()=>{throw Error('failed');})).rejects.toThrow('failed');expect(await queue.run(async()=>3)).toBe(3);
});
