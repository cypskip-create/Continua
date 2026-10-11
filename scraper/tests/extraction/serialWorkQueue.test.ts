import {expect,it} from 'vitest';
import {createSerialWorkQueue} from '../../src/extraction/serialWorkQueue.js';
it('serialises heavy jobs from different callers',async()=>{
  const queue=createSerialWorkQueue();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const events:string[]=[];
  const first=queue(async()=>{events.push('first');await gate;events.push('finished');});
  const second=queue(async()=>{events.push('second');return 2;});
  await Promise.resolve();expect(events).toEqual(['first']);release();
  await first;expect(await second).toBe(2);expect(events).toEqual(['first','finished','second']);
});
it('recovers after a job fails',async()=>{
  const queue=createSerialWorkQueue();
  const failed=queue(async()=>{throw new Error('bad document');});
  const next=queue(async()=>3);
  await expect(failed).rejects.toThrow('bad document');expect(await next).toBe(3);
});
