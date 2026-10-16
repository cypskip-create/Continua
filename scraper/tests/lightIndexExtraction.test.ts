import {vi,it,expect,beforeEach} from 'vitest';
const f=vi.hoisted(()=>({query:vi.fn(),extract:vi.fn(),insert:vi.fn(),failed:vi.fn(),batch:vi.fn()}));
vi.mock('../src/storage/db.js',()=>({query:f.query}));
vi.mock('../src/config/index.js',()=>({env:{SCRAPER_WORKLOAD_ROLE:'render-light'}}));
vi.mock('../src/monitoring/logger.js',()=>({logger:{info:vi.fn(),warn:vi.fn()}}));
vi.mock('../src/storage/sourcesRepository.js',()=>({getSource:async()=>({enabled:true,adapter:'web',config:{seeds:['https://www.nse.co.ke/']}})}));
vi.mock('../src/storage/crawlStateRepository.js',()=>({recordDiscovered:vi.fn(),claimNextBatch:f.batch,markCrawling:vi.fn(),markCrawled:vi.fn(),markFailed:f.failed}));
vi.mock('../src/storage/rawArtifactsRepository.js',()=>({upsertArtifact:async()=>({isNew:false,artifact:{id:'retained-artifact'}})}));
vi.mock('../src/storage/rawStorage.js',()=>({storeRawArtifact:async()=> 'r2:private/key'}));
vi.mock('../src/storage/deadLettersRepository.js',()=>({recordDeadLetter:vi.fn()}));
vi.mock('../src/crawler/httpClient.js',()=>({fetchWithRetry:async()=>({body:Buffer.from('<html/>'),status:200,headers:new Headers({'content-type':'text/html'}),finalUrl:'https://www.nse.co.ke/'}),FetchTooLargeError:class extends Error{},FetchTimeoutError:class extends Error{}}));
vi.mock('../src/crawler/robotsCheck.js',()=>({isAllowedByRobots:async()=>true}));
vi.mock('../src/extraction/nseIndexSummary.js',()=>({extractNseIndexSummary:f.extract}));
vi.mock('../src/storage/extractionsRepository.js',()=>({insertExtraction:f.insert}));
beforeEach(()=>{vi.clearAllMocks();f.batch.mockResolvedValue([{id:'queued',url:'https://www.nse.co.ke/',depth:0}]);f.query.mockResolvedValue({rows:[]});f.extract.mockReturnValue([{kind:'nse_index'}]);});
it('repairs an existing artifact with missing index extraction',async()=>{
 const {crawlSource}=await import('../src/crawler/crawlSource.js');const result=await crawlSource('nse-index-summary',1);
 expect(result.failed).toBe(0);expect(f.insert).toHaveBeenCalledWith(expect.objectContaining({artifactId:'retained-artifact',parserVersion:'render-index-html-v1'}));
});
it('does not duplicate a valid retained index extraction',async()=>{
 f.query.mockResolvedValue({rows:[{id:'extraction'}]});const {crawlSource}=await import('../src/crawler/crawlSource.js');await crawlSource('nse-index-summary',1);
 expect(f.extract).not.toHaveBeenCalled();expect(f.insert).not.toHaveBeenCalled();
});
it('missing dated observations are a failed collection, not a successful empty publication',async()=>{
 f.extract.mockReturnValue([]);const {crawlSource}=await import('../src/crawler/crawlSource.js');const result=await crawlSource('nse-index-summary',1);
 expect(result.failed).toBe(1);expect(f.failed).toHaveBeenCalled();expect(f.insert).not.toHaveBeenCalled();
});
