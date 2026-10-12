import {vi,it,expect,afterEach} from 'vitest';
const bridge=vi.hoisted(()=>vi.fn().mockResolvedValue(undefined));
vi.mock('../src/config/index.js',()=>({env:{NODE_ENV:'production'}}));
vi.mock('../src/workers/indexWorker.js',()=>({runIndexIngestionOnce:bridge}));
vi.mock('../src/monitoring/logger.js',()=>({logger:{warn:vi.fn()}}));
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();bridge.mockClear();});
it('deduplicates catch-up, throttles reads and ingests only after collector completion',async()=>{
 let complete!:(x:unknown)=>void;const fetcher=vi.fn(()=>new Promise(resolve=>{complete=resolve;}));vi.stubGlobal('fetch',fetcher);
 const {requestIndexCollection}=await import('../src/workers/indexReaderRefresh.js');
 requestIndexCollection();requestIndexCollection();expect(fetcher).toHaveBeenCalledTimes(1);expect(bridge).not.toHaveBeenCalled();
 complete({ok:true,body:{cancel:vi.fn().mockResolvedValue(undefined)}});
 await vi.waitFor(()=>expect(bridge).toHaveBeenCalledOnce());requestIndexCollection();expect(fetcher).toHaveBeenCalledTimes(1);
});
it('failed collection does not invent an ingestion or reject the reader response',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));const {requestIndexCollection}=await import('../src/workers/indexReaderRefresh.js');
 expect(()=>requestIndexCollection()).not.toThrow();await new Promise(resolve=>setTimeout(resolve,5));expect(bridge).not.toHaveBeenCalled();
});
