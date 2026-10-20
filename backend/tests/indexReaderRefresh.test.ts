import {vi,it,expect,afterEach} from 'vitest';
const bridge=vi.hoisted(()=>vi.fn().mockResolvedValue(undefined));
const invalidate=vi.hoisted(()=>vi.fn().mockResolvedValue(undefined));
vi.mock('../src/storage/cache.js',()=>({cache:{del:invalidate},CacheKeys:{indices:(exchange:string)=>`indices:${exchange}`}}));
vi.mock('../src/config/index.js',()=>({env:{NODE_ENV:'production',COLLECTOR_EXECUTION_MODE:'actions'}}));
vi.mock('../src/workers/indexWorker.js',()=>({runIndexIngestionOnce:bridge}));
vi.mock('../src/monitoring/logger.js',()=>({logger:{warn:vi.fn()}}));
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();bridge.mockClear();invalidate.mockClear();});
it('actions mode still deduplicates bounded light-index catch-up and ingests only after collector completion',async()=>{
 let complete!:(x:unknown)=>void;const fetcher=vi.fn(()=>new Promise(resolve=>{complete=resolve;}));vi.stubGlobal('fetch',fetcher);
 const {requestIndexCollection}=await import('../src/workers/indexReaderRefresh.js');
 requestIndexCollection();requestIndexCollection();expect(fetcher).toHaveBeenCalledTimes(1);expect(bridge).not.toHaveBeenCalled();
 complete({ok:true,body:{cancel:vi.fn().mockResolvedValue(undefined)}});
 await vi.waitFor(()=>expect(bridge).toHaveBeenCalledOnce());await vi.waitFor(()=>expect(invalidate).toHaveBeenCalledWith('indices:NSE'));requestIndexCollection();expect(fetcher).toHaveBeenCalledTimes(1);
});
it('failed collection does not invent an ingestion or reject the reader response',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));const {requestIndexCollection}=await import('../src/workers/indexReaderRefresh.js');
 expect(()=>requestIndexCollection()).not.toThrow();await new Promise(resolve=>setTimeout(resolve,5));expect(bridge).not.toHaveBeenCalled();
});
