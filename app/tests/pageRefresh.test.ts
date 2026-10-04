import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerPageRefresh, refreshPageData } from '../src/lib/pageRefresh.ts';

test('refreshes mounted local-state feeds and unregisters unmounted feeds', async () => {
  let calls = 0;
  const off = registerPageRefresh(async () => { calls++; });
  await refreshPageData();
  assert.equal(calls, 1);
  off();
  await refreshPageData();
  assert.equal(calls, 1);
});

test('a failing feed does not prevent the other feeds from starting', async () => {
  let refreshed = false;
  const off1 = registerPageRefresh(async () => { throw new Error('offline'); });
  const off2 = registerPageRefresh(async () => { refreshed = true; });
  try {
    await assert.rejects(refreshPageData(), /offline/);
    assert.equal(refreshed, true);
  } finally { off1(); off2(); }
});
