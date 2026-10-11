import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ hash: vi.fn(), find: vi.fn(), touch: vi.fn(), warn: vi.fn(), get: vi.fn() }));
vi.mock('../src/storage/repositories/apiKeyRepository.js', () => ({ hashApiKeyAsync:mocks.hash, apiKeyRepository:{findActiveByHash:mocks.find,touchLastUsed:mocks.touch} }));
vi.mock('../src/storage/cache.js', () => ({cache:{getOrSet:mocks.get}}));
vi.mock('../src/monitoring/logger.js', () => ({logger:{warn:mocks.warn}}));
import {findApiKey, recordApiKeyUse} from '../src/services/apiKeyAccess.js';
describe('API authentication reliability', () => {
  beforeEach(()=>vi.clearAllMocks());
  it('derives the existing hash asynchronously, with no plaintext cache key', async()=>{
    mocks.get.mockImplementation((_key,_ttl,fn)=>fn()); mocks.hash.mockResolvedValue('stored-hash'); mocks.find.mockResolvedValue({id:'one'});
    expect(await findApiKey('fixture-secret')).toEqual({id:'one'});
    expect(mocks.find).toHaveBeenCalledWith('stored-hash');
    expect(mocks.get.mock.calls[0]![0]).not.toContain('fixture-secret');
    expect(mocks.get.mock.calls[0]![1]).toBe(30_000);
  });
  it('catches audit failures without rejecting or repeatedly writing', async()=>{
    mocks.touch.mockRejectedValue(new Error('connection timeout'));
    recordApiKeyUse('audit-failure'); recordApiKeyUse('audit-failure');
    await Promise.resolve();
    expect(mocks.touch).toHaveBeenCalledTimes(1);
    expect(mocks.warn).toHaveBeenCalledTimes(1);
    recordApiKeyUse('audit-failure');
    expect(mocks.touch).toHaveBeenCalledTimes(1);
  });
});
