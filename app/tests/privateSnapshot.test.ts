import test from 'node:test';
import assert from 'node:assert/strict';
import {readPrivateSnapshot, writePrivateSnapshot} from '../src/lib/privateSnapshot.ts';
test('private display snapshots remain owner-scoped and expire without changing freshness', () => {
  const entries = new Map<string,string>();
  const storage = {getItem: (key:string) => entries.get(key) ?? null, setItem: (key:string,value:string) => {entries.set(key,value);}} as Storage;
  const rows = [{user_id:'owner-a',symbol:'KCB'}];
  writePrivateSnapshot('watchlist','owner-a',rows,storage,100);
  assert.deepEqual(readPrivateSnapshot('watchlist','owner-a',storage,101),rows);
  assert.equal(readPrivateSnapshot('watchlist','owner-b',storage,101),undefined);
  assert.equal(readPrivateSnapshot('watchlist','owner-a',storage,99),undefined);
  assert.equal(readPrivateSnapshot('watchlist','owner-a',storage,100+86_400_000),undefined);
  writePrivateSnapshot('watchlist','owner-b',rows,storage,100);
  assert.equal(readPrivateSnapshot('watchlist','owner-b',storage,101),undefined);
});
