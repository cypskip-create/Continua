import {describe,it,expect} from 'vitest';
import {hashApiKey,hashApiKeyAsync} from '../src/storage/repositories/apiKeyRepository.js';
describe('async API key KDF compatibility',()=>{
 it('matches existing stored scrypt hashes exactly',async()=>{
  expect(await hashApiKeyAsync('fixture-not-a-real-key')).toBe(hashApiKey('fixture-not-a-real-key'));
 });
});
