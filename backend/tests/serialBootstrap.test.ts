import {it,expect,vi} from 'vitest';
import {serialBootstrap} from '../src/workers/serialBootstrap.js';
it('runs every enrichment sequentially and retains independent failures',async()=>{
 const events:string[]=[];let running=0;const failure=vi.fn();
 await serialBootstrap(['actions','filings','news','candles'].map(name=>({name,run:async()=>{
  running++;expect(running).toBe(1);events.push(name);await Promise.resolve();running--;if(name==='filings')throw new Error('fixture');
 }})),failure);
 expect(events).toEqual(['actions','filings','news','candles']);expect(failure).toHaveBeenCalledTimes(1);expect(failure.mock.calls[0]?.[0]).toBe('filings');
});
