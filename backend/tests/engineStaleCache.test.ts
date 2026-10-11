import { expect,it,vi } from 'vitest';
const mock=vi.hoisted(()=>({get:vi.fn(),set:vi.fn(),getOrSet:vi.fn(),profile:vi.fn()}));
vi.mock('../src/storage/cache.js',()=>({cache:mock,CacheKeys:{}}));
vi.mock('../src/storage/repositories/securitiesRepository.js',()=>({securitiesRepository:{getCompanyProfile:mock.profile}}));
import { getEngineBundle } from '../src/services/research/engineBundle.js';
it('returns dated last-good research immediately while a failed refresh runs in the background',async()=>{
  const stored={symbol:'ABSA',generatedAt:new Date(Date.now()-120_000).toISOString()};
  mock.get.mockResolvedValue(stored);mock.getOrSet.mockRejectedValue(new Error('temporary failure'));
  expect(await getEngineBundle('ABSA','NSE')).toBe(stored);
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(mock.set).not.toHaveBeenCalled();
  expect(await getEngineBundle('ABSA','NSE')).toBe(stored);
});
it('does not label an expired bundle as current or extend its timestamp',async()=>{
  mock.get.mockResolvedValue({generatedAt:new Date(Date.now()-25*60*60_000).toISOString()});
  mock.getOrSet.mockRejectedValue(new Error('offline'));
  await expect(getEngineBundle('OLD','NSE')).rejects.toThrow('offline');
});
it('a partial successful response cannot erase last-good financial evidence or extend its age',async()=>{
 const stored={symbol:'KCB',history:[{fiscalYear:2025,revenue:100}],generatedAt:new Date(Date.now()-120_000).toISOString()};
 mock.get.mockResolvedValue(stored);mock.getOrSet.mockResolvedValue({symbol:'KCB',history:[],unavailable:['Financial statements'],generatedAt:new Date().toISOString()});mock.set.mockClear();
 expect(await getEngineBundle('KCB','NSE')).toBe(stored);
 await new Promise(resolve=>setTimeout(resolve,0));
 const [,retained,ttl]=mock.set.mock.calls[0]!;
 expect(retained.history).toEqual(stored.history);expect(retained.generatedAt).toBe(stored.generatedAt);expect(retained.refresh.state).toBe('retained');expect(ttl).toBeLessThan(24*60*60_000);
});
