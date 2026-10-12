import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../src/config/index.js',()=>({env:{NEWS_SCRAPER_URL:'https://collector.example',NODE_ENV:'test'}}));
vi.mock('../src/monitoring/logger.js',()=>({logger:{warn:vi.fn()}}));
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it('returns immediately and coalesces financial reads into one bounded wake request',async()=>{
 const fetch=vi.fn((_url:URL)=>new Promise(()=>{}));vi.stubGlobal('fetch',fetch);
 const {requestDocumentCollection}=await import('../src/workers/documentCollectionRequest.js');
 expect(requestDocumentCollection()).toBeUndefined();requestDocumentCollection();requestDocumentCollection();
 expect(fetch).toHaveBeenCalledTimes(1);expect(String(fetch.mock.calls[0]?.[0])).toBe('https://collector.example/documents/refresh');
});
