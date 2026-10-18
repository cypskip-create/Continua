import {vi,it,expect,afterEach} from 'vitest';
const f=vi.hoisted(()=>({query:vi.fn(),crawl:vi.fn(),get:vi.fn()}));
vi.mock('../src/storage/db.js',()=>({query:f.query}));
vi.mock('../src/storage/sourcesRepository.js',()=>({getSource:f.get,listEnabledSources:vi.fn()}));
vi.mock('../src/crawler/crawlSource.js',()=>({crawlSource:f.crawl}));
vi.mock('../src/adapters/registry.js',()=>({hasRegisteredAdapter:()=>false,runRegisteredAdapter:vi.fn()}));
vi.mock('../src/extraction/extractionSweep.js',()=>({sweepUnextractedArtifacts:vi.fn()}));
vi.mock('../src/config/defaultSources.js',()=>({ensureDefaultSources:vi.fn()}));
vi.mock('../src/config/index.js',()=>({env:{SCHEDULER_ENABLED:true,SCRAPER_WORKLOAD_ROLE:'render-light'}}));
vi.mock('../src/monitoring/logger.js',()=>({logger:{info:vi.fn(),warn:vi.fn(),error:vi.fn()}}));
afterEach(()=>{vi.resetModules();vi.clearAllMocks();});
it('claims a durable bounded recovery and records its attempt without widening collection',async()=>{
 f.get.mockResolvedValue({id:'nse-index-summary',enabled:true,adapter:'web'});
 f.query.mockResolvedValueOnce({rows:[{id:'slot',attempt:'2'}]}).mockResolvedValue({rows:[]});
 f.crawl.mockResolvedValue({visited:1,failed:0});
 const {refreshIndexSource}=await import('../src/scheduler/scheduler.js');await refreshIndexSource();
 expect(f.crawl).toHaveBeenCalledWith('nse-index-summary',1);
 expect(f.query.mock.calls.length).toBe(2);
 const sql=f.query.mock.calls[0]![0];
 expect(sql).toContain("status='failed'");expect(sql).toContain("::int,1)<2");expect(sql).toContain("interval '20 minutes'");
 expect(JSON.parse(f.query.mock.calls[1]![1][2])).toMatchObject({attempt:2,visited:1,failed:0});
});
it('a completed or locked slot performs no publisher request',async()=>{
 f.get.mockResolvedValue({id:'nse-index-summary',enabled:true,adapter:'web'});f.query.mockResolvedValue({rows:[]});
 const {refreshIndexSource}=await import('../src/scheduler/scheduler.js');await refreshIndexSource();
 expect(f.crawl).not.toHaveBeenCalled();
});
