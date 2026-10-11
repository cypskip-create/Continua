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
