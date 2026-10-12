import {vi,it,expect,afterEach} from 'vitest';
const f=vi.hoisted(()=>({get:vi.fn(),crawl:vi.fn().mockResolvedValue({})}));
vi.mock('../src/storage/sourcesRepository.js',()=>({getSource:f.get,listEnabledSources:vi.fn()}));
vi.mock('../src/crawler/crawlSource.js',()=>({crawlSource:f.crawl}));
vi.mock('../src/adapters/registry.js',()=>({hasRegisteredAdapter:()=>false,runRegisteredAdapter:vi.fn()}));
vi.mock('../src/extraction/extractionSweep.js',()=>({sweepUnextractedArtifacts:vi.fn()}));
vi.mock('../src/config/defaultSources.js',()=>({ensureDefaultSources:vi.fn()}));
vi.mock('../src/config/index.js',()=>({env:{SCHEDULER_ENABLED:true}}));
vi.mock('../src/monitoring/logger.js',()=>({logger:{info:vi.fn(),error:vi.fn()}}));
afterEach(()=>{vi.resetModules();f.get.mockReset();f.crawl.mockClear();});
it('reader catch-up only runs the enabled official index source, once per cooldown',async()=>{
 f.get.mockResolvedValue({id:'nse-index-summary',enabled:true,adapter:'web'});
 const {refreshIndexSource}=await import('../src/scheduler/scheduler.js');
 await Promise.all([refreshIndexSource(),refreshIndexSource()]);await refreshIndexSource();
 expect(f.get).toHaveBeenCalledWith('nse-index-summary');expect(f.crawl).toHaveBeenCalledTimes(1);
});
it('disabled source is not silently enabled or fetched',async()=>{
 f.get.mockResolvedValue({id:'nse-index-summary',enabled:false,adapter:'web'});
 const {refreshIndexSource}=await import('../src/scheduler/scheduler.js');await refreshIndexSource();expect(f.crawl).not.toHaveBeenCalled();
});
