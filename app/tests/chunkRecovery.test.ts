import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverStaleChunk } from '../src/lib/chunkRecovery.ts';

test('retired deployment chunks refresh once without a reload loop', () => {
  let stamp: string | null = null, reloads = 0;
  const storage = {getItem: () => stamp, setItem: (_key: string, value: string) => {stamp = value;}};
  const error = new TypeError('Failed to fetch dynamically imported module: /assets/old-page.js');
  assert.equal(recoverStaleChunk(error, storage, () => reloads++, 1000), true);
  assert.equal(recoverStaleChunk(error, storage, () => reloads++, 1001), false);
  assert.equal(recoverStaleChunk(error, storage, () => reloads++, 180999), false);
  assert.equal(reloads, 1);
  assert.equal(recoverStaleChunk(error, storage, () => reloads++, 181000), true);
});

test('application failures and disabled storage never trigger an automatic reload', () => {
  let reloads = 0;
  const storage = {getItem: () => {throw new Error('Storage disabled');}, setItem: () => {}};
  assert.equal(recoverStaleChunk(new Error('Application failed'), storage, () => reloads++), false);
  assert.equal(recoverStaleChunk(new Error('Loading chunk 12 failed'), storage, () => reloads++), false);
  assert.equal(reloads, 0);
});
